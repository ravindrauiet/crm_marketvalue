/**
 * Re-extracts saved chain POs from their original uploaded files using the exact parsers
 * (Flipkart / Amazon Excel, Amazon / Swiggy / DMart PDF) and fixes wrong PO numbers,
 * quantities, values and DC names. Also retires "-NNNN" duplicate copies created by
 * re-uploads.
 *
 *   npx tsx scripts/repair-po-data.ts          # dry run: prints what would change
 *   npx tsx scripts/repair-po-data.ts --apply  # writes the changes
 */
import { PrismaClient } from '@prisma/client';
import pdf from 'pdf-parse';
import { ParsedPO, parseKnownPoPdfText, parseKnownPoSpreadsheet } from '../lib/poParsers';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function load(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) return Buffer.from(url.split(',')[1] || '', 'base64');
    if (!/^https?:/.test(url)) return null;
    const r = await fetch(url);
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch { return null; }
}

async function parse(fileName: string, buf: Buffer): Promise<ParsedPO[] | null> {
  if (/\.pdf$/i.test(fileName)) {
    const text = (await pdf(buf)).text || '';
    const p = parseKnownPoPdfText(text);
    return p && p.items.length ? [p] : null;
  }
  return parseKnownPoSpreadsheet(buf);
}

(async () => {
  console.log(APPLY ? '*** APPLY MODE: changes will be written ***\n' : '--- Dry run (add --apply to write changes) ---\n');
  const pos = await prisma.chainPurchaseOrder.findMany({
    where: { status: { not: 'REMOVED' } },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  });

  let fixed = 0, unchanged = 0, skipped = 0, retired = 0;
  const finalNumbers = new Map<string, string>(); // corrected PO number -> id that owns it

  for (const po of pos) {
    const url = po.imagekitUrl || po.filePath || '';
    const buf = url ? await load(url) : null;
    const parsed = buf ? await parse(po.fileName || url, buf).catch(() => null) : null;
    if (!parsed || !parsed.length) { skipped++; continue; }

    // Pick the parsed PO matching this record (an export may hold several POs)
    // Numbers invented from file names / EAN codes are not real PO numbers
    const invented = /^PurchaseOrder_/i.test(po.poNumber) || /^\d{13}(-\d{4})?$/.test(po.poNumber) || /^vendor$/i.test(po.poNumber);
    const base = invented ? '' : po.poNumber.replace(/-\d{4}$/, '').replace(/^purchase[_\s-]*order[_\s-]*/i, '');
    const p = parsed.find(x => x.poNumber && base && (x.poNumber === base || x.poNumber.startsWith(base) || base.startsWith(x.poNumber))) || parsed[0];
    const poNumber = p.poNumber || base;
    if (!poNumber) { console.log(`?  ${po.poNumber} (${po.chainName}, ${po.fileName}): file has no PO number — needs manual entry, skipped`); skipped++; continue; }

    const newTotal = Math.round(p.items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100;
    const owner = finalNumbers.get(poNumber);
    if (owner && owner !== po.id) {
      console.log(`DUP  ${po.poNumber} is a re-upload of ${poNumber} -> mark REMOVED`);
      if (APPLY) await prisma.chainPurchaseOrder.update({ where: { id: po.id }, data: { status: 'REMOVED' } });
      retired++;
      continue;
    }
    // Another live record may already use the corrected number
    const clash = poNumber !== po.poNumber ? await prisma.chainPurchaseOrder.findUnique({ where: { poNumber } }) : null;
    if (clash && clash.id !== po.id && clash.status !== 'REMOVED') {
      console.log(`DUP  ${po.poNumber} duplicates existing ${poNumber} -> mark REMOVED`);
      if (APPLY) await prisma.chainPurchaseOrder.update({ where: { id: po.id }, data: { status: 'REMOVED' } });
      retired++;
      continue;
    }
    finalNumbers.set(poNumber, po.id);

    let raw: any = {};
    try { raw = JSON.parse(po.rawDocumentInfo || '{}'); } catch {}
    const changes: string[] = [];
    if (poNumber !== po.poNumber) changes.push(`PO no ${po.poNumber} -> ${poNumber}`);
    if (Math.abs(newTotal - po.totalAmount) > 0.5) changes.push(`value ${inr(po.totalAmount)} -> ${inr(newTotal)}`);
    if (p.items.length !== po.items.length) changes.push(`items ${po.items.length} -> ${p.items.length}`);
    if (p.dcName && p.dcName !== raw.dcName) changes.push(`DC "${p.dcName}"`);
    // Cross-check against the document's own taxable total where the layout states one
    const check = p.docTaxableTotal
      ? (Math.abs(p.docTaxableTotal - newTotal) <= 1 ? 'matches document total' : `!! document says ${inr(p.docTaxableTotal)}`)
      : (p.docGrandTotal ? `doc grand total incl. GST ${inr(p.docGrandTotal)}` : 'no document total to check');
    if (p.warnings.length) changes.push(`warnings: ${p.warnings.join(' / ')}`);
    changes.push(check);
    if (!changes.length) { unchanged++; continue; }

    console.log(`FIX  [${p.parser}] ${po.chainName} ${po.poNumber}: ${changes.join('; ')}`);
    fixed++;

    if (APPLY) {
      if (clash && clash.status === 'REMOVED') await prisma.chainPurchaseOrder.update({ where: { id: clash.id }, data: { poNumber: `${clash.poNumber}-old-${clash.id.slice(-4)}` } });
      // Keep tally names / mapping links from the existing items where the product matches
      const prev = new Map(po.items.map(i => [(i.eanCode || i.chainItemCode).toLowerCase(), i]));
      await prisma.chainPurchaseOrder.update({
        where: { id: po.id },
        data: {
          poNumber,
          totalAmount: newTotal,
          ...(p.poDate ? { poDate: new Date(`${p.poDate}T00:00:00Z`) } : {}),
          ...(p.deliveryDate && !po.appointmentDate ? { appointmentDate: new Date(`${p.deliveryDate}T00:00:00Z`) } : {}),
          rawDocumentInfo: JSON.stringify({
            ...raw,
            parser: p.parser, documentNumber: poNumber, shippingAddress: p.shipTo || raw.shippingAddress, dcName: p.dcName,
            docTaxableTotal: p.docTaxableTotal, docGrandTotal: p.docGrandTotal, repairedAt: new Date().toISOString(),
          }),
          items: {
            deleteMany: {},
            create: p.items.map(i => {
              const old = prev.get((i.eanCode || i.chainItemCode).toLowerCase());
              return {
                chainItemCode: i.chainItemCode, chainItemName: i.chainItemName,
                tallyItemName: old?.tallyItemName || '', eanCode: i.eanCode || null, hsnCode: i.hsnCode || null,
                quantityPcs: i.quantityPcs, quantityCase: old?.quantityCase && old.quantityPcs ? i.quantityPcs * (old.quantityCase / old.quantityPcs) : i.quantityPcs,
                unitPrice: i.unitPrice, totalPrice: i.totalPrice, mappingId: old?.mappingId || null,
              };
            }),
          },
        },
      });
    }
  }

  console.log(`\nSummary: ${fixed} to fix, ${retired} duplicate copies to retire, ${unchanged} already correct, ${skipped} skipped (other chains / no parser / no PO number).`);
  await prisma.$disconnect();
})();
