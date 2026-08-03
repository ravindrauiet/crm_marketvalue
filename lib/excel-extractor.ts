import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { ExtractionResult, ExtractedProduct } from './ai';

function cleanVal(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Deterministically extract product & PO header information from Excel (.xlsx, .xls) and CSV (.csv) files.
 * Provides maximum accuracy for tabular PO documents.
 */
export async function extractFromExcel(
  filePath: string,
  vendor: string = 'default'
): Promise<ExtractionResult> {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Excel/CSV file appears to be empty or unreadable');
  }

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  if (!rawData || rawData.length === 0) {
    throw new Error('Excel/CSV sheet appears to be empty');
  }

  // 1. Find header row by scoring row contents for column keywords
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  const kwScore = (str: string) => {
    const s = str.toLowerCase();
    let score = 0;
    if (/sku|code|asin|fsn|ean|article|material|barcode|item\s*code|item\s*no/i.test(s)) score += 3;
    if (/desc|title|name|item|product|material\s*desc/i.test(s)) score += 3;
    if (/qty|quantity|units|outstanding|order\s*qty/i.test(s)) score += 3;
    if (/price|cost|rate|mrp|amount|value|taxable/i.test(s)) score += 2;
    return score;
  };

  let maxScore = 0;
  for (let i = 0; i < Math.min(rawData.length, 35); i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;

    let totalScore = 0;
    row.forEach(cell => {
      if (cell) totalScore += kwScore(String(cell));
    });

    if (totalScore >= 5 && totalScore > maxScore) {
      maxScore = totalScore;
      headerRowIdx = i;
    }
  }

  if (headerRowIdx === -1) {
    headerRowIdx = rawData.findIndex(r => r && Array.isArray(r) && r.length > 1) || 0;
  }

  const headerRow = rawData[headerRowIdx] || [];
  headerRow.forEach((cell: any, idx: number) => {
    if (cell !== null && cell !== undefined) {
      const key = String(cell).trim().toLowerCase();
      if (key) colMap[key] = idx;
    }
  });

  // 2. Extract Document Metadata
  const metadata = extractDocMetadata(rawData, filePath, vendor, headerRowIdx, colMap);

  // 3. Map Columns
  const getIdx = (...terms: string[]) => {
    for (const term of terms) {
      const exact = Object.keys(colMap).find(k => k === term.toLowerCase());
      if (exact !== undefined) return colMap[exact];
    }
    for (const term of terms) {
      const partial = Object.keys(colMap).find(k => k.includes(term.toLowerCase()));
      if (partial !== undefined) return colMap[partial];
    }
    return -1;
  };

  const eanIdx = getIdx('ean/upc code', 'ean', 'barcode', 'upc', 'ean code');
  const skuIdx = getIdx('sku code', 'asin', 'fsn/isbn13', 'materialcode', 'article', 'sku', 'code', 'material', 'hsn', 'item code');
  const nameIdx = getIdx('description', 'title', 'sku desc', 'item description', 'product name', 'name', 'item', 'vertical', 'material description');
  const qtyIdx = getIdx('quantity outstanding', 'quantity', 'qty', 'po qty', 'case quantity', 'units', 'order qty');
  const priceIdx = getIdx('landing cost', 'basic cost', 'unit cost', 'supplier price', 'unitprice', 'unit price', 'price', 'rate', 'mrp', 'taxable value');
  const brandIdx = getIdx('brand');

  const products: ExtractedProduct[] = [];

  // 4. Parse Products
  for (let r = headerRowIdx + 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rowStr = row.map(cleanVal).join(' ').toLowerCase();
    if (rowStr.includes('total') || rowStr.includes('(count)') || rowStr.includes('buyer signature') || rowStr.includes('subtotal')) continue;

    const rawSku = skuIdx >= 0 ? cleanVal(row[skuIdx]) : '';
    const rawEan = eanIdx >= 0 ? cleanVal(row[eanIdx]) : '';
    const rawName = nameIdx >= 0 ? cleanVal(row[nameIdx]) : '';
    const rawQty = qtyIdx >= 0 ? cleanVal(row[qtyIdx]) : '0';
    const rawPrice = priceIdx >= 0 ? cleanVal(row[priceIdx]) : '0';
    const rawBrand = brandIdx >= 0 ? cleanVal(row[brandIdx]) : '';

    const sku = rawSku || rawEan || '';
    const ean = rawEan || (rawSku.length === 13 && /^\d+$/.test(rawSku) ? rawSku : '');
    const name = rawName || rawSku || '';
    const qty = parseFloat(rawQty.replace(/[^0-9.]/g, '')) || 0;
    const price = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;

    if ((sku || name) && (qty > 0 || price > 0 || name.length > 3)) {
      products.push({
        sku,
        ean,
        eanCode: ean,
        name,
        quantity: qty,
        price,
        totalPrice: Number((qty * price).toFixed(2)),
        brand: rawBrand || undefined,
        group: vendor !== 'default' ? `${vendor.toUpperCase()} PO` : 'PO Item',
      });
    }
  }

  const result: ExtractionResult = {
    rawDocumentInfo: {
      documentType: 'Purchase Order (Spreadsheet)',
      vendorName: metadata.vendorName || (vendor !== 'default' ? vendor.toUpperCase() : undefined),
      documentNumber: metadata.poNumber || undefined,
      documentDate: metadata.poDate || undefined,
      deliveryDate: metadata.deliveryDate || undefined,
      allVisibleText: rawData.slice(0, headerRowIdx).map(r => r.map(cleanVal).filter(Boolean).join(' ')).filter(Boolean).join('\n'),
      lineItemsSummary: products.map(p => `${p.sku || p.ean}: ${p.name} (Qty: ${p.quantity}, Rate: ₹${p.price})`).join('\n')
    },
    products,
    metadata: {
      totalItems: products.length,
      method: 'UNIVERSAL_EXCEL_PARSER',
      processedDate: new Date().toISOString()
    }
  };

  return result;
}

function extractDocMetadata(rows: any[][], filePath: string, vendor: string, headerRowIdx: number, colMap: Record<string, number>) {
  let poNumber = '';
  let poDate = '';
  let deliveryDate = '';
  let vendorName = '';

  // 1. Scan top rows for key-value text pairs
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cellStr = cleanVal(row[c]);
      if (!cellStr) continue;

      if (!poNumber) {
        const m = cellStr.match(/(?:PO\s*(?:Number|No|#)?|Purchase\s*Order\s*(?:Number|No|#)?)\s*[:=\s#]\s*([A-Za-z0-9\-_]{4,30})/i);
        if (m && m[1] && !['NUMBER', 'DATE', 'DETAILS', 'ORDER', 'EXPIRED'].includes(m[1].toUpperCase())) {
          poNumber = m[1];
        }
      }

      if (!poDate) {
        const m = cellStr.match(/(?:PO\s*Date|Order\s*Date|Date)\s*[:=\s]\s*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}[\/-][A-Za-z]{3}[\/-][0-9]{2,4})/i);
        if (m && m[1]) poDate = m[1];
      }

      if (!deliveryDate) {
        const m = cellStr.match(/(?:Delivery\s*Date|Appointment\s*Date|PO\s*Expiry\s*date|Required\s*by\s*Date|Window\s*end)\s*[:=\s]\s*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}[\/-][A-Za-z]{3}[\/-][0-9]{2,4})/i);
        if (m && m[1]) deliveryDate = m[1];
      }

      if (!vendorName) {
        const m = cellStr.match(/(?:Vendor|Supplier|Billed\s*By)\s*[:=\s]\s*([A-Za-z0-9\s\-_]{3,40})/i);
        if (m && m[1]) vendorName = m[1];
      }
    }
  }

  // 2. Fallback to column data from first row if table header exists
  if (headerRowIdx >= 0 && headerRowIdx + 1 < rows.length) {
    const firstDataRow = rows[headerRowIdx + 1] || [];
    const getColVal = (...terms: string[]) => {
      for (const term of terms) {
        const key = Object.keys(colMap).find(k => k === term.toLowerCase() || k.includes(term.toLowerCase()));
        if (key !== undefined && colMap[key] !== undefined) {
          const val = cleanVal(firstDataRow[colMap[key]]);
          if (val) return val;
        }
      }
      return '';
    };

    if (!poNumber) poNumber = getColVal('po number', 'po #', 'po no', 'po');
    if (!poDate) poDate = getColVal('po date', 'order date');
    if (!deliveryDate) deliveryDate = getColVal('window end', 'delivery date', 'required by date', 'expected date');
    if (!vendorName) vendorName = getColVal('vendor name', 'vendor', 'supplier');
  }

  // 3. Fallback from filename (strip path and timestamp if present)
  if (!poNumber) {
    const baseName = filePath.split(/[/\\]/).pop() || '';
    const cleanFn = baseName.replace(/^[0-9]+_/, '');
    const fnMatch = cleanFn.match(/([A-Za-z0-9\-_]{6,25})/);
    if (fnMatch) poNumber = fnMatch[1];
  }

  return { poNumber, poDate, deliveryDate, vendorName };
}
