// Re-parses POs saved by the old AI / generic path from their stored original file.
// Dry run by default; pass --apply to write. Old values are backed up to BACKUP_FILE first.
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import pdf from 'pdf-parse';
import { parseKnownPoSpreadsheet, parseKnownPoPdfText, ParsedPO } from '../lib/poParsers';

const p = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BACKUP_FILE = process.env.BACKUP_FILE || 'po-repair-backup.json';
const DETERMINISTIC = /^(amazon|flipkart|swiggy|dmart|zepto|reliance|bigbasket)-/;

(async () => {
  const pos = await p.chainPurchaseOrder.findMany({ where: { status: { not: 'REMOVED' } }, include: { items: true } });
  const candidates = pos.filter(po => {
    let raw: any = {}; try { raw = JSON.parse(po.rawDocumentInfo || '{}'); } catch {}
    return !DETERMINISTIC.test(raw.parser || '') && (po.imagekitUrl || /^https?:/.test(po.filePath || ''));
  });
  console.log(`candidates: ${candidates.length} of ${pos.length}`);
  const backup: any[] = [];
  const summary: Record<string, number> = {};
  const plan: Record<string, number> = {};
  const claimed = new Set<string>();
  for (const po of candidates) {
    const url = po.imagekitUrl || po.filePath!;
    let parsed: ParsedPO[] | null = null;
    try {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      if (/\.pdf($|\?)/i.test(url)) { const t = (await pdf(buf)).text; const one = parseKnownPoPdfText(t); parsed = one ? [one] : null; }
      else parsed = parseKnownPoSpreadsheet(buf);
    } catch (e: any) { console.log('  fetch/parse error', po.poNumber, e.message); }
    const match = parsed?.find(x => x.poNumber.toUpperCase() === po.poNumber.toUpperCase()) || (parsed?.length === 1 ? parsed[0] : undefined);
    const key = `${po.chainName}:${match ? match.parser : 'no-parser'}`;
    summary[key] = (summary[key] || 0) + 1;
    if (!match || !match.items.length) continue;
    const realWarnings = match.warnings.filter(w => !/no PO column/i.test(w));
    if (realWarnings.length) { console.log('SKIP (failed cross-check)', po.chainName, po.poNumber, realWarnings.join('; ')); summary['skip-warn'] = (summary['skip-warn'] || 0) + 1; continue; }
    // The document's own PO number wins over a file-name style or truncated one
    const docPo = match.poNumber && match.poNumber.toUpperCase() !== po.poNumber.toUpperCase() ? match.poNumber : '';
    let action = 'UPDATE';
    if (docPo) {
      const owner = await p.chainPurchaseOrder.findUnique({ where: { poNumber: docPo } });
      if ((owner && owner.id !== po.id) || claimed.has(docPo)) action = 'DUPLICATE';
      else { action = 'RENAME'; claimed.add(docPo); }
    }
    const bills = await p.purchaseBill.count({ where: { notes: { startsWith: 'PO:' + (docPo || po.poNumber) } } });
    console.log(`PLAN ${action} ${po.chainName} ${po.poNumber}${docPo ? ' -> ' + docPo : ''} (sale invoices for it: ${bills})`);
    plan[action] = (plan[action] || 0) + 1;
    if (action === 'DUPLICATE') {
      if (APPLY) {
        backup.push({ id: po.id, poNumber: po.poNumber, status: po.status, action });
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 1));
        await p.chainPurchaseOrder.update({ where: { id: po.id }, data: { status: 'REMOVED', notes: [po.notes, 'Duplicate upload of ' + docPo].filter(Boolean).join(' | ') } });
      }
      continue;
    }
    const newTotal = Math.round(match.items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100;
    const oldQty = po.items.reduce((s, i) => s + i.quantityPcs, 0), newQty = match.items.reduce((s, i) => s + i.quantityPcs, 0);
    console.log(`  ${po.chainName} ${po.poNumber} [${match.parser}${match.poNumber !== po.poNumber ? ' docPO=' + match.poNumber : ''}] items ${po.items.length}->${match.items.length} qty ${oldQty}->${newQty} value ${po.totalAmount}->${newTotal} expiry ${po.deliveryDate?.toISOString().slice(0, 10) || '-'}->${match.deliveryDate || '-'} dc "${match.dcName}"${match.warnings.length ? ' WARN ' + match.warnings.join('; ') : ''}`);
    console.log(`     e.g. "${po.items[0]?.chainItemName}" @${po.items[0]?.unitPrice} -> "${match.items[0].chainItemName}" @${match.items[0].unitPrice}`);
    if (APPLY) {
      backup.push({ id: po.id, action, poNumber: po.poNumber, poDate: po.poDate, totalAmount: po.totalAmount, deliveryDate: po.deliveryDate, rawDocumentInfo: po.rawDocumentInfo, items: po.items });
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 1));
      // Keep any mapping already resolved for the same item code
      const mappedByCode = new Map(po.items.filter(i => i.tallyItemName).map(i => [i.chainItemCode, i]));
      let raw: any = {}; try { raw = JSON.parse(po.rawDocumentInfo || '{}'); } catch {}
      await p.$transaction([
        p.chainPOItem.deleteMany({ where: { poId: po.id } }),
        p.chainPOItem.createMany({ data: match.items.map(i => {
          const prev = mappedByCode.get(i.chainItemCode);
          return {
            poId: po.id, chainItemCode: i.chainItemCode, chainItemName: i.chainItemName, eanCode: i.eanCode || null, hsnCode: i.hsnCode || null,
            quantityPcs: i.quantityPcs, quantityCase: prev && prev.quantityPcs ? prev.quantityCase * i.quantityPcs / prev.quantityPcs : 0,
            unitPrice: i.unitPrice, totalPrice: i.totalPrice, tallyItemName: prev?.tallyItemName || null, mappingId: prev?.mappingId || null,
          };
        }) }),
        p.chainPurchaseOrder.update({ where: { id: po.id }, data: {
          totalAmount: newTotal,
          ...(action === 'RENAME' ? { poNumber: docPo } : {}),
          ...(match.poDate && match.poDate !== po.poDate.toISOString().slice(0, 10) ? { poDate: new Date(match.poDate + 'T00:00:00.000Z') } : {}),
          ...(match.deliveryDate && !po.deliveryDate ? { deliveryDate: new Date(match.deliveryDate + 'T00:00:00.000Z') } : {}),
          rawDocumentInfo: JSON.stringify({ ...raw, parser: match.parser, dcName: match.dcName || raw.dcName, shippingAddress: match.shipTo || raw.shippingAddress,
            docTaxableTotal: match.docTaxableTotal, docGrandTotal: match.docGrandTotal, repairedAt: new Date().toISOString(), repairWarnings: match.warnings }),
        } }),
      ]);
    }
  }
  console.log('summary', JSON.stringify(summary), 'plan', JSON.stringify(plan));
  if (APPLY) console.log(`applied ${backup.length}; backup in ${BACKUP_FILE}`);
  await p.$disconnect();
})();
