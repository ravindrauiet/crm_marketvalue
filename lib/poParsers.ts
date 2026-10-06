// Deterministic parsers for chain purchase orders whose layout is known.
// They avoid AI misreads (e.g. PDF text where quantity, MRP and price run together)
// by cross-checking every line: quantity × unit price must equal the line value.
//
// Money convention: unitPrice / totalPrice are EX-GST (taxable) values, so PO value is
// comparable with Tally sale invoice amounts. The document's grand total (incl. GST) is
// kept separately in docGrandTotal.

import * as XLSX from 'xlsx';
import { parseDate, toNumber } from './validation';

export type ParsedPOItem = {
  chainItemCode: string;
  eanCode: string;
  chainItemName: string;
  hsnCode?: string;
  quantityPcs: number;
  unitPrice: number;   // ex-GST
  totalPrice: number;  // ex-GST
  mrp?: number;
};

export type ParsedPO = {
  chain: string;
  parser: string;
  poNumber: string;
  poDate: string | null;        // YYYY-MM-DD
  deliveryDate: string | null;  // YYYY-MM-DD (appointment / expiry)
  shipTo: string;
  dcName: string;
  items: ParsedPOItem[];
  docTaxableTotal: number | null;
  docGrandTotal: number | null;
  warnings: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

/** US-style M/D/YYYY (Amazon "Ordered On" / "Expected date") */
function parseUSDate(s: string): Date | null {
  const m = clean(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return parseDate(s);
  return parseDate(`${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`);
}

const COMPANY_WORDS = /\b(private|pvt|limited|ltd|llp|inc|retail india|india private)\b/i;

/**
 * Short DC / FC name from a shipping address, e.g.
 * "Sugal logistics Park, Bilaspur,KH NO. 60/142…" -> "Sugal logistics Park, Bilaspur"
 * "Avenue Supermarts Ltd., EDM Mall, Ghaziabad 201010" -> "EDM Mall, Ghaziabad"
 */
export function dcNameFromAddress(address: string | null | undefined): string {
  if (!address) return '';
  const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : s);
  // Drop plot / khasra / block numbers and PIN codes: "Block -3, Khasra No. 23//6/1 VILLAGE BIJWASAN …"
  const text = String(address)
    .replace(/\b(?:block|plot|khasa?ra|kh|survey|gat|h\.?\s*no)\b\.?\s*(?:no\.?)?\s*[-:]?\s*[\d/\s,&-]*(?=[A-Za-z]|$)/gi, ' ')
    .replace(/\b\d{6}\b/g, ' ')
    .replace(/\bindia\b/gi, ' ');
  // "Village Malha Majra Sonipat" -> the village / locality is the DC's usual name
  const village = text.match(/\bvill(?:age)?\b\.?\s*([A-Za-z][A-Za-z ]{2,40}?)(?=\s*(?:[,.\-\d]|\btehsil\b|$))/i);
  if (village) return titleCase(village[1].trim());

  const parts = text
    .split(/[,\n]|\s-\s/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(p => !COMPANY_WORDS.test(p))
    .filter(p => !/^(kh|khasra|plot|survey|h\.?\s*no|gstin|pan|phone|india)\b/i.test(p))
    .filter(p => !/^[\d\s/.\-]+$/.test(p))
    .map(p => p.replace(/\b\d{6}\b/, '').trim())
    .filter(p => p.length > 1);
  // A specific first part (e.g. Zepto "GUR-DRY-MH-FARUKHNAGAR (GUR033M)") is the DC on its own
  if (parts[0] && /\([A-Z0-9]+\)/.test(parts[0])) return parts[0].slice(0, 60);
  return parts.slice(0, 2).join(', ').slice(0, 60);
}

/** Strip "purchase_order_" style prefixes that come from file names */
export function cleanPoNumber(po: string): string {
  const original = clean(po);
  const stripped = original.replace(/^purchase[_\s-]*order[_\s-]*(no\.?)?[_\s:#-]*/i, '').trim();
  // Only strip when what remains looks like a real PO number ("FLS98XX36V", not "43_")
  return /^[A-Za-z0-9][A-Za-z0-9-]{5,}$/.test(stripped) && /\d/.test(stripped) ? stripped : original;
}

// ─── Spreadsheet helpers ────────────────────────────────────────────────────

function sheetRows(buf: Buffer): any[][] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
}

/** First non-empty cell to the right of a cell matching `label` (searching the first `maxRows` rows) */
function valueAfterLabel(rows: any[][], label: RegExp, maxRows = 20): string {
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (label.test(clean(row[c]))) {
        for (let k = c + 1; k < row.length; k++) {
          const v = clean(row[k]);
          if (v) return v;
        }
      }
    }
  }
  return '';
}

// ─── Flipkart Excel ─────────────────────────────────────────────────────────

export function isFlipkartPoSheet(rows: any[][]): boolean {
  const top = rows.slice(0, 6).map(r => r.map(clean).join(' ')).join(' ');
  return /FLIPKART/i.test(top) && /PURCHASE ORDER NO/i.test(top);
}

export function parseFlipkartExcel(rows: any[][]): ParsedPO {
  const warnings: string[] = [];
  let poNumber = '';
  for (const row of rows.slice(0, 8)) {
    const m = row.map(clean).join(' ').match(/PURCHASE ORDER NO\.?\s*[-:#]?\s*([A-Z0-9]+)/i);
    if (m) { poNumber = m[1]; break; }
  }

  const poDate = iso(parseDate(valueAfterLabel(rows, /^order date$/i)));
  const deliveryDate = iso(parseDate(valueAfterLabel(rows, /^expiry date$/i)));
  const shipTo = valueAfterLabel(rows, /^shipped to address$/i);

  // Two-row table header: "S. no. | HSN | Product ID | Quantity …" then "Title | Ean | … | Taxable Value"
  const h1 = rows.findIndex(r => r.some(c => /^s\.?\s*no\.?$/i.test(clean(c))) && r.some(c => /^quantity$/i.test(clean(c))));
  if (h1 === -1) throw new Error('Flipkart PO: item table header not found');
  const head = (rows[h1] || []).map((c, j) => `${clean(c)} ${clean((rows[h1 + 1] || [])[j])}`.toLowerCase().trim());
  const col = (re: RegExp) => head.findIndex(h => re.test(h));

  const cQty = col(/^quantity\b/);
  const cPid = col(/product id/);
  const cHsn = col(/hsn/);
  const cTitle = col(/\btitle\b/);
  const cEan = col(/\bean\b/);
  const cUnit = col(/supplier unit price/);
  const cTaxable = col(/taxable value/);
  const cTotal = col(/^total amount/);
  const cMrp = col(/supplier mrp/);

  const items: ParsedPOItem[] = [];
  let docTaxableTotal: number | null = null;
  let docGrandTotal: number | null = null;

  for (let r = h1 + 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const sno = clean(row[0]);
    if (/total/i.test(row.map(clean).join(' '))) {
      docTaxableTotal = toNumber(row[cTaxable]);
      docGrandTotal = toNumber(row[cTotal]);
      break;
    }
    if (!/^\d+$/.test(sno)) continue;

    const qty = toNumber(row[cQty]) ?? 0;
    const taxable = toNumber(row[cTaxable]);
    const unitInclTax = toNumber(row[cUnit]) ?? 0;
    const lineTaxable = taxable ?? qty * unitInclTax;
    items.push({
      chainItemCode: clean(row[cEan]) || clean(row[cPid]),
      eanCode: clean(row[cEan]),
      chainItemName: clean(row[cTitle]),
      hsnCode: clean(row[cHsn]) || undefined,
      quantityPcs: Math.round(qty),
      unitPrice: qty > 0 ? round2(lineTaxable / qty) : 0,
      totalPrice: round2(lineTaxable),
      mrp: toNumber(row[cMrp]) ?? undefined,
    });
  }

  if (!poNumber) warnings.push('PO number not found in the Flipkart sheet');
  return {
    chain: 'FLIPKART', parser: 'flipkart-excel', poNumber, poDate, deliveryDate,
    shipTo, dcName: dcNameFromAddress(shipTo), items, docTaxableTotal, docGrandTotal, warnings,
  };
}

// ─── Amazon Excel (Vendor Central PO export) ────────────────────────────────

export function isAmazonPoSheet(rows: any[][]): boolean {
  const header = (rows[0] || []).map(c => clean(c).toLowerCase());
  return header.includes('asin') && header.includes('unit cost');
}

/** Returns one ParsedPO per PO number found (an export can contain several POs) */
export function parseAmazonExcel(rows: any[][]): ParsedPO[] {
  const header = (rows[0] || []).map(c => clean(c).toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) { const i = header.indexOf(n); if (i !== -1) return i; }
    return -1;
  };
  const cPo = col('po', 'po number', 'purchase order');
  const cShip = col('ship to location');
  const cAsin = col('asin');
  const cExtId = col('external id');
  const cExtType = col('external id type');
  const cHsn = col('hsn');
  const cTitle = col('title');
  const cReq = col('quantity requested');
  const cAcc = col('accepted quantity');
  const cUnit = col('unit cost');
  const cTotal = col('total cost');
  const cWinStart = col('window start');
  const cWinEnd = col('window end');
  const cExpected = col('expected date');

  const groups = new Map<string, ParsedPO>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const asin = clean(row[cAsin]);
    if (!asin) continue;
    const po = cPo >= 0 ? clean(row[cPo]) : '';
    const key = po || '__NO_PO__';
    if (!groups.has(key)) {
      const ship = cShip >= 0 ? clean(row[cShip]) : '';
      // Window columns are day-first (2/10/2026 = 2 Oct); "Expected date" is month-first
      const delivery = cWinEnd >= 0 ? parseDate(clean(row[cWinEnd])) : (cExpected >= 0 ? parseUSDate(clean(row[cExpected])) : null);
      groups.set(key, {
        chain: 'AMAZON', parser: 'amazon-excel', poNumber: po,
        poDate: cWinStart >= 0 ? null : null,
        deliveryDate: iso(delivery),
        shipTo: ship, dcName: ship.split(',')[0].trim(),
        items: [], docTaxableTotal: 0, docGrandTotal: null,
        warnings: po ? [] : ['This Amazon export has no PO column — please enter the PO number'],
      });
    }
    const g = groups.get(key)!;

    const requested = toNumber(row[cReq]) ?? 0;
    const accepted = cAcc >= 0 && clean(row[cAcc]) !== '' ? toNumber(row[cAcc]) ?? 0 : requested;
    const unit = toNumber(row[cUnit]) ?? 0;
    // Amazon "Total cost" = accepted qty × unit cost (ex-GST)
    const total = cTotal >= 0 && clean(row[cTotal]) !== '' ? toNumber(row[cTotal]) ?? accepted * unit : accepted * unit;
    const extType = cExtType >= 0 ? clean(row[cExtType]).toUpperCase() : 'EAN';
    const ean = extType === 'EAN' ? clean(row[cExtId]) : '';

    g.items.push({
      chainItemCode: asin,
      eanCode: ean,
      chainItemName: clean(row[cTitle]),
      hsnCode: clean(row[cHsn]) || undefined,
      quantityPcs: Math.round(accepted),
      unitPrice: round2(unit),
      totalPrice: round2(total),
    });
    g.docTaxableTotal = round2((g.docTaxableTotal || 0) + total);
  }
  return [...groups.values()];
}

// ─── BigBasket Excel ────────────────────────────────────────────────────────

export function isBigBasketPoSheet(rows: any[][]): boolean {
  return rows.slice(0, 25).some(r => r.some(c => /^PO Number\s*:/i.test(clean(c))))
    && rows.slice(0, 30).some(r => r.map(c => clean(c).toLowerCase()).includes('basic cost'));
}

export function parseBigBasketExcel(rows: any[][]): ParsedPO {
  const warnings: string[] = [];
  const cellValue = (label: RegExp) => {
    for (const r of rows.slice(0, 25)) for (const c of r) {
      const m = clean(c).match(label);
      if (m) return m[1].trim();
    }
    return '';
  };
  const poNumber = cellValue(/^PO Number\s*:\s*(\S+)/i);
  const poDate = iso(parseDate(cellValue(/^PO Date\s*:\s*(.+)$/i)));
  const delivery = iso(parseDate(cellValue(/^PO Expiry date\s*:\s*(.+)$/i)));
  // Warehouse name sits under "Warehouse Address" / "Delivery Address"
  const whIdx = rows.findIndex(r => r.some(c => /^warehouse address$/i.test(clean(c))));
  const dcName = whIdx >= 0 ? clean((rows[whIdx + 1] || [])[0]) : clean((rows[0] || [])[0]);
  const shipTo = whIdx >= 0 ? [1, 2, 3, 4].map(k => clean((rows[whIdx + k] || [])[0])).filter(Boolean).join(', ') : dcName;

  const h = rows.findIndex(r => r.map(c => clean(c).toLowerCase()).includes('basic cost'));
  const head = (rows[h] || []).map(c => clean(c).toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const cSku = col('sku code'), cDesc = col('description'), cEan = col('ean/upc code'), cHsn = col('hsn code');
  const cQty = col('quantity'), cBasic = col('basic cost'), cMrp = col('mrp'), cTotal = col('total value');

  const items: ParsedPOItem[] = [];
  let grand = 0;
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!/^\d+$/.test(clean(row[0]))) { if (/total/i.test(row.map(clean).join(' '))) break; continue; }
    const qty = toNumber(row[cQty]) ?? 0;
    const basic = toNumber(row[cBasic]) ?? 0;
    grand += toNumber(row[cTotal]) ?? 0;
    const ean = clean(row[cEan]);
    items.push({
      chainItemCode: clean(row[cSku]),
      eanCode: /^\d{12,14}$/.test(ean) ? ean : '',
      chainItemName: clean(row[cDesc]),
      hsnCode: clean(row[cHsn]) || undefined,
      quantityPcs: Math.round(qty),
      unitPrice: basic,
      totalPrice: round2(qty * basic),
      mrp: toNumber(row[cMrp]) ?? undefined,
    });
  }
  if (!poNumber) warnings.push('PO number not found in the BigBasket sheet');
  return {
    chain: 'BIGBASKET', parser: 'bigbasket-excel', poNumber, poDate, deliveryDate: delivery,
    shipTo, dcName, items, docTaxableTotal: null, docGrandTotal: round2(grand), warnings,
  };
}

// ─── PDF helpers ────────────────────────────────────────────────────────────

/**
 * Splits a run-together number blob into [quantity columns][unit price] using the line total:
 * the price is a numeric suffix of the blob such that lineTotal / price is a whole quantity
 * that also appears in the quantity digits.
 * e.g. "288288028820.06" with total 5777.28 -> qty 288 @ 20.06
 *      "120120012052"    with total 6240    -> qty 120 @ 52
 */
function splitQtyAndPrice(blob: string, lineTotal: number): { qty: number; price: number } | null {
  const b = blob.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(b)) return null;
  for (let k = 1; k < b.length; k++) {
    const prefix = b.slice(0, k);
    const suffix = b.slice(k);
    if (prefix.includes('.')) break;           // the price is always the last number
    if (/^0\d/.test(suffix)) continue;          // a price never has a leading zero
    const price = parseFloat(suffix);
    if (!(price > 0)) continue;
    if (lineTotal === 0) continue;
    const qty = Math.round(lineTotal / price);
    if (qty <= 0) continue;
    if (Math.abs(qty * price - lineTotal) > Math.max(0.05, lineTotal * 0.002)) continue;
    if (prefix.includes(String(qty))) return { qty, price };
  }
  return null;
}

// ─── Amazon PDF ─────────────────────────────────────────────────────────────

export function isAmazonPoText(text: string) {
  return /^\s*PO:\s*[A-Z0-9]{8}\s*$/m.test(text) && /ASIN/.test(text) && /Unit Cost/i.test(text);
}

export function parseAmazonPdf(text: string): ParsedPO {
  const warnings: string[] = [];
  const t = text.replace(/\r/g, '');
  const lines = t.split('\n').map(l => l.trim());
  const after = (label: string) => {
    const i = lines.findIndex(l => l.toLowerCase() === label.toLowerCase());
    return i >= 0 ? lines[i + 1] || '' : '';
  };

  const poNumber = (t.match(/^\s*PO:\s*([A-Z0-9]{8})\s*$/m) || [])[1] || '';
  const shipTo = after('Ship to location');
  const orderedOn = parseUSDate(after('Ordered On'));               // month-first
  const winEnd = after('Ship window').split('-').map(x => x.trim())[1]; // day-first

  // Item blocks start with an ASIN at the beginning of a line
  const starts: number[] = [];
  lines.forEach((l, i) => { if (/^B[0-9A-Z]{9}/.test(l)) starts.push(i); });

  const items: ParsedPOItem[] = [];
  for (let n = 0; n < starts.length; n++) {
    const block = lines.slice(starts[n], n + 1 < starts.length ? starts[n + 1] : undefined);
    const asin = block[0].slice(0, 10);

    // EAN / HSN: digit-only lines after "EAN:" (EAN = first 13 digits, HSN = the rest)
    let i = 1;
    const hasEan = /EAN:/.test(block[0]);
    let digits = (block[0].match(/EAN:\s*(\d*)/) || [])[1] || '';
    // Skip id fragments (digits, or model-number pieces like "B00TIK7WL") that precede the title
    while (i < block.length && (/^\d+$/.test(block[i]) || /^[A-Z0-9]{1,12}$/.test(block[i]))) {
      if (/^\d+$/.test(block[i])) digits += block[i];
      i++;
    }
    const ean = hasEan ? digits.slice(0, 13) : '';
    const hsn = (hasEan ? digits.slice(13) : digits.slice(-8)) || '';

    // Title until "Delivery" (optionally preceded by the NO/YES backordered flag)
    const rest = block.slice(i).join('\n');
    const titleMatch = rest.match(/^([\s\S]*?)(?:NO|YES)?\s*Delivery\s*\n?\s*window/);
    const title = (titleMatch ? titleMatch[1] : '').replace(/\s*\n\s*/g, ' ').trim();

    // "<MM/DD/YYYY><qty columns + unit cost> INR<line total> INR" (total may wrap a line)
    const flat = rest.replace(/\s*\n\s*/g, '');
    const nums = flat.match(/(\d{2}\/\d{2}\/\d{4})([\d.,]+)\s*INR\s*([\d.,]+)\s*INR/);
    if (!nums) { warnings.push(`Could not read the numbers for ${asin}`); continue; }
    const lineTotal = toNumber(nums[3]) ?? 0;
    let qty = 0; let price = 0;
    if (lineTotal > 0) {
      const split = splitQtyAndPrice(nums[2], lineTotal);
      if (!split) { warnings.push(`Could not read the quantity for ${asin}`); continue; }
      qty = split.qty; price = split.price;
    }
    items.push({
      chainItemCode: asin, eanCode: ean, chainItemName: title, hsnCode: hsn || undefined,
      quantityPcs: qty, unitPrice: price, totalPrice: round2(lineTotal),
    });
  }

  const itemsSum = round2(items.reduce((s, it) => s + it.totalPrice, 0));
  const declared = (t.match(/PO items \((\d+)\)/) || [])[1];
  if (declared && Number(declared) !== items.length) warnings.push(`PO lists ${declared} items but ${items.length} were read`);

  // The "Accepted" summary line ends with the accepted total cost, e.g. "163,054144732.88 INR"
  const acceptedLine = (after('Accepted') || '').replace(/\s*INR.*$/, '').replace(/,/g, '');
  const sumStr = itemsSum.toFixed(2).replace(/\.?0+$/, '');
  const docTaxableTotal = acceptedLine && (acceptedLine.endsWith(itemsSum.toFixed(2)) || acceptedLine.endsWith(sumStr)) ? itemsSum : null;
  if (acceptedLine && docTaxableTotal === null) warnings.push('Item total does not match the PO "Accepted" total — please check');

  return {
    chain: 'AMAZON', parser: 'amazon-pdf', poNumber,
    poDate: iso(orderedOn), deliveryDate: iso(parseDate(winEnd || '')),
    shipTo, dcName: shipTo.split(',')[0].trim(),
    items, docTaxableTotal, docGrandTotal: null, warnings,
  };
}

// ─── Swiggy (Scootsy) PDF ───────────────────────────────────────────────────

export function isSwiggyPoText(text: string) {
  return /SCOOTSY/i.test(text) && /PO\s+No:\s*[A-Z0-9]+/i.test(text.replace(/\t/g, ' '));
}

export function parseSwiggyPdf(text: string): ParsedPO {
  const t = text.replace(/\t/g, ' ').replace(/\r/g, '');
  const warnings: string[] = [];
  const grab = (re: RegExp) => ((t.match(re) || [])[1] || '').trim();

  const poNumber = grab(/PO\s+No:\s*([A-Z0-9]+)/i);
  const poDate = iso(parseDate(grab(/PO\s+Date:\s*(\d{4}-\d{2}-\d{2})/i)));
  const delivery = iso(parseDate(grab(/Expected\s+Delivery\s+Date:\s*(\d{4}-\d{2}-\d{2})/i) || grab(/PO\s+Expiry\s+Date:\s*(\d{4}-\d{2}-\d{2})/i)));
  const pod = grab(/Pod\s+Name:\s*([^\n]+)/i);
  const shipLine = grab(/Shipping\s*Address\s*\n[^\n]*\n([^\n]+)/i);

  // Item table: from the end of the column headers to "Total Amount"
  const headEnd = t.search(/Total\s*\(INR\)/i);
  const tableEnd = t.search(/Total\s+Amount\s*\(INR\)/i);
  const section = t.slice(headEnd >= 0 ? headEnd : 0, tableEnd >= 0 ? tableEnd : undefined)
    .replace(/^Total\s*\(INR\)[\s\S]*?\(INR\)\s*\n(?:\s*\n)?/i, '');

  // Every line, whatever the layout, has: <8-digit HSN><qty><MRP>.<2d><base cost>.<2d><taxable, may wrap><first GST rate %>
  // (taxable always has 2 decimals, possibly wrapped: "2057.1\n4"; it may be glued to the rate: "986.670.00%")
  // (the quantity may also sit on its own line: "09109100\n80\n65.0044.57")
  // (taxable is normally 2 decimals, occasionally printed with 1: "5785.7")
  // (some pages put every value on its own line: "19024090108\n100.00\n71.43\n7714.2\n9")
  // (rarely the taxable value is split around the line: "12312." before the item, "00" after the prices)
  const itemRe = /(?<!\d)(\d{8})\s*\n?\s*(\d[\d\s]*?)\.(\d{2})\s*(\d+)\.(\d{2})((?:[\d\s]*\.\s*(?:\d\s*\d|\d))|(?:\s*\n\d{2}\s*))(?=\s*\d+\.\d{2}%)/g;
  const items: ParsedPOItem[] = [];
  let sno = 1;
  let chunkStart = 0;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(section))) {
    // Text before the HSN = "<sno><item code>" + description (previous line total may lead the chunk)
    const chunkLines = section.slice(chunkStart, m.index).split('\n').map(l => l.trim()).filter(Boolean);
    // Integer part of a split taxable value ("12312.") that was printed before the item
    const splitInt = [...chunkLines].reverse().find(l => /^\d+\.$/.test(l));
    // Drop leftovers before the item: column headers ("Rate", "Amt (INR)") and the previous line total
    while (chunkLines.length && !/^\d/.test(chunkLines[0])) chunkLines.shift();
    while (chunkLines.length && /^[\d.]*\.\d+$|^[\d.%]+$/.test(chunkLines[0]) && !/^\d+$/.test(chunkLines[0])) chunkLines.shift();
    // Leading digit tokens = serial no. + item code. From line 10 the serial no. wraps
    // ("1","0","7163"), so with several tokens the last one is the code; a single token
    // ("13394") is serial + code glued together.
    const tokens: string[] = [];
    let descStart = 0;
    for (; descStart < chunkLines.length; descStart++) {
      const mm = chunkLines[descStart].match(/^(\d+)(.*)$/);
      if (!mm) break;
      tokens.push(mm[1]);
      if (mm[2].trim()) { chunkLines[descStart] = mm[2].trim(); break; }
    }
    if (descStart === chunkLines.length) descStart = chunkLines.length;
    let code = tokens.length > 1 ? tokens[tokens.length - 1] : (tokens[0] || '');
    if (tokens.length === 1 && code.startsWith(String(sno)) && code.length > String(sno).length) code = code.slice(String(sno).length);
    const desc = chunkLines.slice(descStart).join(' ').trim();

    const taxableRaw = m[6].replace(/\s+/g, '');
    const base = parseFloat(`${m[4]}.${m[5]}`);
    let taxable = (taxableRaw.includes('.') ? toNumber(taxableRaw) : null) ?? 0;
    if (!taxableRaw.includes('.') && splitInt) {
      // The fragment may carry a stray serial-number digit ("112312." for 12312.00): use the
      // longest tail that gives a whole quantity matching the quantity digits
      const digits = splitInt.replace('.', '');
      const qtyDigits = m[2].replace(/\s+/g, '');
      for (let k = 0; k < digits.length; k++) {
        const v = parseFloat(`${digits.slice(k)}.${taxableRaw}`);
        const q = base > 0 ? Math.round(v / base) : 0;
        if (q > 0 && Math.abs(q * base - v) <= Math.max(0.05, v * 0.002) && qtyDigits.startsWith(String(q))) { taxable = v; break; }
      }
    }
    const qty = base > 0 ? Math.round(taxable / base) : 0;
    let mrp: number | undefined;
    const qtyMrp = m[2].replace(/\s+/g, '');
    if (qty > 0 && qtyMrp.startsWith(String(qty))) mrp = parseFloat(`${qtyMrp.slice(String(qty).length)}.${m[3]}`);
    else warnings.push(`Line ${sno}: quantity cross-check failed`);

    items.push({
      chainItemCode: code, eanCode: '', chainItemName: desc, hsnCode: m[1],
      quantityPcs: qty, unitPrice: base, totalPrice: round2(taxable), mrp,
    });
    sno++;
    // Next chunk starts after this line's GST / total figures
    const rest = section.slice(itemRe.lastIndex);
    const lineEnd = rest.search(/\n/);
    chunkStart = itemRe.lastIndex + (lineEnd >= 0 ? lineEnd : rest.length);
  }

  return {
    chain: 'SWIGGY', parser: 'swiggy-pdf', poNumber, poDate, deliveryDate: delivery,
    shipTo: [shipLine, pod].filter(Boolean).join(', '), dcName: pod || dcNameFromAddress(shipLine),
    items,
    docTaxableTotal: toNumber(grab(/Total\s+Amount\s*\(INR\):\s*([\d,.]+)/i)),
    docGrandTotal: toNumber(grab(/Grand\s+Total\s*\(INR\):\s*([\d,.]+)/i)),
    warnings,
  };
}

// ─── DMart (Avenue Supermarts) PDF ──────────────────────────────────────────

export function isDmartPoText(text: string) {
  return /Avenue Supermarts/i.test(text) && /PO\s*#/i.test(text);
}

export function parseDmartPdf(text: string): ParsedPO {
  const t = text.replace(/\r/g, '');
  const lines = t.split('\n').map(l => l.trim());
  const warnings: string[] = [];

  // "PO # / PO Date / Delivery Dt" labels followed by their three values
  const lbl = lines.findIndex(l => /^PO\s*#$/i.test(l));
  const poNumber = lbl >= 0 ? lines[lbl + 3] || '' : ((t.match(/Purchase order\s*:\s*(\d+)/i) || [])[1] || '');
  const poDate = lbl >= 0 ? iso(parseDate(lines[lbl + 4])) : null;
  const delivery = lbl >= 0 ? iso(parseDate(lines[lbl + 5])) : null;

  const shipIdx = lines.findIndex(l => /^Ship To/i.test(l));
  const shipTo = shipIdx >= 0 ? [lines[shipIdx].replace(/^Ship To/i, ''), lines[shipIdx + 1], lines[shipIdx + 2]].join(', ') : '';

  const items: ParsedPOItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^(\d+)\s+(\d{8,14})\s+(.*)$/);
    if (!head) continue;
    let name = head[3];
    let j = i + 1;
    while (j < lines.length && !/^(EA|PC|PCS|KG|BOX|CS)\s+/i.test(lines[j])) { name += ' ' + lines[j]; j++; }
    if (j >= lines.length) break;
    const hsn = (name.match(/HSN\s*Code:\s*(\d+)/i) || [])[1];
    name = name.replace(/\[?HSN\s*Code:\s*\d+\]?/i, '').trim();

    // "EA   120025.02   0.000.000.00   5.00  0.00   26.27   66.00  3,152.16"
    const nums = lines[j].replace(/^\S+\s+/, '').split(/\s+/);
    const blob = nums[0];                       // qty + free qty + base price glued
    const lPrice = toNumber(nums[nums.length - 3]) ?? 0; // landed price (incl. GST)
    const tValue = toNumber(nums[nums.length - 1]) ?? 0; // line value (incl. GST)
    const mrp = toNumber(nums[nums.length - 2]) ?? undefined;
    const qty = lPrice > 0 ? Math.round(tValue / lPrice) : 0;
    const bm = blob.match(/^(\d+)\.(\d{2})$/);
    let base = 0;
    if (bm && bm[1].startsWith(String(qty))) {
      // after qty comes the free qty (usually "0"), then the base price integer part
      const restInt = bm[1].slice(String(qty).length).replace(/^0(?=\d)/, '');
      base = parseFloat(`${restInt}.${bm[2]}`);
    } else {
      warnings.push(`Line ${head[1]}: quantity cross-check failed`);
    }
    items.push({
      chainItemCode: head[2], eanCode: head[2], chainItemName: name, hsnCode: hsn,
      quantityPcs: qty, unitPrice: base, totalPrice: round2(qty * base), mrp,
    });
    i = j;
  }

  const totalLine = lines.find(l => /^Total[\d,.]+$/.test(l)) || '';
  const grand = items.length ? (() => {
    // "Total3607211.88" = total qty glued to total value; strip the known qty
    const totalQty = items.reduce((s, it) => s + it.quantityPcs, 0);
    const rest = totalLine.replace(/^Total/, '');
    return rest.startsWith(String(totalQty)) ? toNumber(rest.slice(String(totalQty).length)) : null;
  })() : null;

  return {
    chain: 'DMART', parser: 'dmart-pdf', poNumber, poDate, deliveryDate: delivery,
    shipTo, dcName: dcNameFromAddress(shipTo),
    items, docTaxableTotal: round2(items.reduce((s, i) => s + i.totalPrice, 0)), docGrandTotal: grand, warnings,
  };
}

// ─── Zepto PDF ──────────────────────────────────────────────────────────────

export function isZeptoPoText(text: string) {
  return /ZEPTO\s+LIMITED|Kiranakart/i.test(text) && /PO\s*No:\s*P\d+/i.test(text);
}

export function parseZeptoPdf(text: string): ParsedPO {
  const t = text.replace(/\t/g, ' ').replace(/\r/g, '');
  const warnings: string[] = [];
  const grab = (re: RegExp) => ((t.match(re) || [])[1] || '').trim();

  const poNumber = grab(/PO\s*No:\s*(P\d+)/i);
  const poDate = iso(parseDate(grab(/PO\s*Date:\s*(\d{4}-\d{2}-\d{2})/i)));
  const delivery = iso(parseDate(grab(/PO\s*Expiry\s*Date:\s*(\d{4}-\d{2}-\d{2})/i) || grab(/Expected\s*Delivery\s*Date:\s*(\d{4}-\d{2}-\d{2})/i)));
  // DC code line follows the "ZEPTO LIMITED (Formerly known as …)" line, e.g. "FBD-DRY-MH (FBD001M)"
  const dc = grab(/ZEPTO LIMITED[^\n]*\n([^\n]+)/i);
  const shipTo = [dc, grab(/ZEPTO LIMITED[^\n]*\n[^\n]+\n([^\n]+)/i)].filter(Boolean).join(', ');

  const tableStart = t.search(/RateAMTRateAMT/i);
  const tableEnd = t.search(/Total\s+Taxable\s+Amount/i);
  const section = t.slice(tableStart >= 0 ? tableStart : 0, tableEnd >= 0 ? tableEnd : undefined).replace(/^RateAMT[^\n]*\n/i, '');

  // "<HSN 8><EAN 13><qty><MRP>.<2d><base>.<2d><taxable>.<2d>" glued to the first GST rate
  const itemRe = /(\d{8})(\d{13})(\d+)\.(\d{2})(\d+)\.(\d{2})(\d+)\.(\d{2})(?=\d+\.\d{2}%)/g;
  const items: ParsedPOItem[] = [];
  let chunkStart = 0; let sno = 1;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(section))) {
    const lines = section.slice(chunkStart, m.index).split('\n').map(l => l.trim()).filter(Boolean)
      .filter(l => !/^[0-9a-f]{4,}(-[0-9a-f]*)+$|^[0-9a-f-]{8,}$/i.test(l)); // drop SKU UUID fragments
    while (lines.length && !/^\d/.test(lines[0])) lines.shift();
    const head = lines.shift() || '';
    let code = (head.match(/^(\d+)/) || [])[1] || '';
    if (code.startsWith(String(sno)) && code.length > String(sno).length) code = code.slice(String(sno).length);
    const name = [head.replace(/^\d+/, ''), ...lines].join(' ').replace(/\s+/g, ' ').trim();

    const base = parseFloat(`${m[5]}.${m[6]}`);
    const taxable = parseFloat(`${m[7]}.${m[8]}`);
    const qty = base > 0 ? Math.round(taxable / base) : 0;
    let mrp: number | undefined;
    if (qty > 0 && m[3].startsWith(String(qty))) mrp = parseFloat(`${m[3].slice(String(qty).length)}.${m[4]}`);
    else warnings.push(`Line ${sno}: quantity cross-check failed`);

    // Zepto item mappings are keyed by the material code (e.g. 145619); EAN kept separately
    items.push({ chainItemCode: code || m[2], eanCode: m[2], chainItemName: name, hsnCode: m[1], quantityPcs: qty, unitPrice: base, totalPrice: round2(taxable), mrp });
    sno++;
    const rest = section.slice(itemRe.lastIndex);
    const nl = rest.search(/\n/);
    chunkStart = itemRe.lastIndex + (nl >= 0 ? nl : rest.length);
  }

  return {
    chain: 'ZEPTO', parser: 'zepto-pdf', poNumber, poDate, deliveryDate: delivery,
    shipTo, dcName: dc || dcNameFromAddress(shipTo), items,
    docTaxableTotal: toNumber(grab(/Total\s+Taxable\s+Amount\s*\(INR\)\s*([\d,.]+)/i)),
    docGrandTotal: toNumber(grab(/Grand\s+Total\s+Amount\s*\(INR\)\s*([\d,.]+)/i)),
    warnings,
  };
}

// ─── Reliance (RCCL / Metro) PDF ────────────────────────────────────────────

export function isReliancePoText(text: string) {
  return /Reliance\s+(Cash\s+And\s+Carry|Retail)/i.test(text) && /PO\s*NO\.?\s*:\s*\d+/i.test(text);
}

export function parseReliancePdf(text: string): ParsedPO {
  const t = text.replace(/\t/g, ' ').replace(/\r/g, '');
  const warnings: string[] = [];
  const grab = (re: RegExp) => ((t.match(re) || [])[1] || '').trim();

  const poNumber = grab(/PO\s*NO\.?\s*:\s*(\d+)/i);
  const poDate = iso(parseDate(grab(/PO\s*Date\s*:\s*([\d.\/-]+)/i)));
  const delivery = iso(parseDate(grab(/DELIVERY\s+DATE\s*:\s*([\d.\/-]+)/i)));
  // Store name printed above the acceptance paragraph, e.g. "RCCL Semra Lucknow"
  const store = grab(/\n\s*(RCCL[^\n]+|Reliance (?:Retail|Smart)[^\n]*?(?:Store|DC)[^\n]*)\n/i);
  const site = grab(/Site\s*:\s*([A-Z0-9]+)/i);

  const lines = t.split('\n').map(l => l.trim());
  const items: ParsedPOItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^(\d{1,3})\s+(\d{6,12})$/);
    if (!head) continue;
    // Item block runs until the next item or the grand total
    let j = i + 1;
    while (j < lines.length && !/^\d{1,3}\s+\d{6,12}$/.test(lines[j]) && !/^Grand Total of Qty/i.test(lines[j])) j++;
    const block = lines.slice(i + 1, j).filter(Boolean);
    const hsn = block.find(l => /^\d{8}$/.test(l)) || '';
    const ean = block.find(l => /^\d{13}$/.test(l)) || '';
    const name = block.find(l => /[A-Za-z]{3,}/.test(l) && !/^(CAR|EA|PC|KG)$/i.test(l) && !/^[A-Z0-9]{3,5}$/.test(l)) || '';
    // Quantities have 3 decimals: first = order unit (e.g. 4 CAR), second = pieces (96 EA)
    const qtys = block.filter(l => /^[\d,]+\.\d{3}$/.test(l)).map(l => toNumber(l) ?? 0);
    const money = block.flatMap(l => l.split(/\s{2,}/)).filter(s => /^[\d,]+\.\d{2}$/.test(s.trim())).map(s => toNumber(s) ?? 0);
    const totalBase = money.length ? money[money.length - 1] : 0;
    const pcs = qtys.length > 1 ? qtys[1] : (qtys[0] || 0);
    if (!pcs || !totalBase) { warnings.push(`Item ${head[1]}: could not read quantity / value`); continue; }
    items.push({
      chainItemCode: head[2], eanCode: ean, chainItemName: name, hsnCode: hsn || undefined,
      quantityPcs: Math.round(pcs), unitPrice: round2(totalBase / pcs), totalPrice: round2(totalBase),
    });
    i = j - 1;
  }

  const docTaxableTotal = toNumber(grab(/TOTAL\s+BASIC\s+VALUE\s*INR\s*([\d,.]+)/i));
  return {
    chain: 'RELIANCE', parser: 'reliance-pdf', poNumber, poDate, deliveryDate: delivery,
    shipTo: [store, site].filter(Boolean).join(' / '), dcName: store || site,
    items, docTaxableTotal,
    docGrandTotal: toNumber(grab(/Total\s+Order\s+Value\s*:?\s*INR\s*([\d,.]+)/i)),
    warnings,
  };
}

// ─── Entry points ───────────────────────────────────────────────────────────

/** Tries the known chain layouts for a spreadsheet; returns null when none match */
export function parseKnownPoSpreadsheet(buf: Buffer): ParsedPO[] | null {
  let rows: any[][];
  try { rows = sheetRows(buf); } catch { return null; }
  if (isFlipkartPoSheet(rows)) return [withTotalCheck(parseFlipkartExcel(rows))];
  if (isAmazonPoSheet(rows)) return parseAmazonExcel(rows).map(withTotalCheck);
  if (isBigBasketPoSheet(rows)) return [withTotalCheck(parseBigBasketExcel(rows))];
  return null;
}

/** Tries the known chain layouts for PDF text; returns null when none match */
export function parseKnownPoPdfText(text: string): ParsedPO | null {
  if (isAmazonPoText(text)) return withTotalCheck(parseAmazonPdf(text));
  if (isSwiggyPoText(text)) return withTotalCheck(parseSwiggyPdf(text));
  if (isDmartPoText(text)) return withTotalCheck(parseDmartPdf(text));
  if (isZeptoPoText(text)) return withTotalCheck(parseZeptoPdf(text));
  if (isReliancePoText(text)) return withTotalCheck(parseReliancePdf(text));
  return null;
}

/** Warns when the items read do not add up to the total printed on the PO (₹1 rounding allowed) */
function withTotalCheck(p: ParsedPO): ParsedPO {
  const sum = round2(p.items.reduce((s, i) => s + i.totalPrice, 0));
  if (p.docTaxableTotal !== null && p.docTaxableTotal > 0 && Math.abs(sum - p.docTaxableTotal) > 1) {
    p.warnings.push(`Items add up to ₹${sum.toLocaleString('en-IN')} but the PO total is ₹${p.docTaxableTotal.toLocaleString('en-IN')} — some lines may be missing; please check before relying on this PO.`);
  }
  return p;
}

/**
 * Reads the document's own totals from PDF text, for checking AI-extracted items.
 * Returns the largest "Grand Total / Total Amount / Net Amount" figure found.
 */
export function documentTotalsFromText(text: string): number[] {
  const t = text.replace(/\t/g, ' ');
  const re = /(?:grand\s*total|total\s*amount|net\s*amount|po\s*value|total\s*value|total\s*cost)[^\d\n]{0,25}([\d,]+\.\d{2})/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) { const v = toNumber(m[1]); if (v && v > 0) out.push(v); }
  return out;
}

/**
 * Sanity check of extracted items against the document totals (ex-GST items may be up to
 * ~28% below an incl-GST grand total). Returns a warning string or null.
 */
export function checkAgainstDocumentTotals(itemsTotal: number, docTotals: number[]): string | null {
  if (!docTotals.length || itemsTotal <= 0) return null;
  const ok = docTotals.some(d => itemsTotal <= d * 1.02 && itemsTotal >= d / 1.3);
  if (ok) return null;
  const max = Math.max(...docTotals);
  return `Extracted items add up to ₹${itemsTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} but the document total is ₹${max.toLocaleString('en-IN', { maximumFractionDigits: 2 })}. Please check quantities and prices before saving.`;
}
