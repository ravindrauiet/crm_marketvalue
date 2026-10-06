import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveBufferToUploads, publicPathForStoredFile } from '@/lib/fileStorage';
import { extractProductsWithAI } from '@/lib/ai';
import { extractFromExcel } from '@/lib/excel-extractor';
import { uploadToImageKit } from '@/lib/imagekit';
import {
  ParsedPO, checkAgainstDocumentTotals, cleanPoNumber, dcNameFromAddress, documentTotalsFromText,
  parseKnownPoPdfText, parseKnownPoSpreadsheet,
} from '@/lib/poParsers';
import { parseDate } from '@/lib/validation';
import { unlinkSync } from 'fs';
import pdf from 'pdf-parse';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

type RawItem = { chainItemCode: string; chainItemName: string; eanCode: string; quantityPcs: number; unitPrice: number; totalPrice?: number };

/** Extracted PO before item-mapping enrichment */
type ExtractedPO = {
  poNumber: string;
  poDate: string;
  deliveryDate: string;
  dcName: string;
  shipTo: string;
  items: RawItem[];
  warnings: string[];
  rawDocumentInfo: any;
};

function fromParsed(p: ParsedPO): ExtractedPO {
  return {
    poNumber: p.poNumber,
    poDate: p.poDate || '',
    deliveryDate: p.deliveryDate || '',
    dcName: p.dcName,
    shipTo: p.shipTo,
    items: p.items.map(i => ({
      chainItemCode: i.chainItemCode,
      chainItemName: i.chainItemName,
      eanCode: i.eanCode,
      quantityPcs: i.quantityPcs,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice, // the document's own line value (avoids rounding drift from qty × rounded price)
    })),
    warnings: p.warnings,
    rawDocumentInfo: {
      documentType: 'Purchase Order',
      parser: p.parser,
      documentNumber: p.poNumber,
      documentDate: p.poDate,
      deliveryDate: p.deliveryDate,
      shippingAddress: p.shipTo,
      dcName: p.dcName,
      docTaxableTotal: p.docTaxableTotal,
      docGrandTotal: p.docGrandTotal,
      lineItemsSummary: p.items.map(i => `${i.chainItemCode}: ${i.chainItemName} (Qty: ${i.quantityPcs}, Rate: ₹${i.unitPrice}, Value: ₹${i.totalPrice})`).join('\n'),
    },
  };
}

/** Normalises a date string from any extractor to YYYY-MM-DD ('' if unreadable) */
function isoDate(v: any): string {
  const d = parseDate(v);
  return d ? d.toISOString().slice(0, 10) : '';
}

// POST /api/po/upload
// Upload and extract PO details. Known chain layouts (Flipkart / Amazon Excel, Amazon / Swiggy / DMart PDF)
// use exact parsers; anything else falls back to the generic Excel reader or AI, and is checked
// against the totals printed on the document.
export async function POST(req: NextRequest) {
  console.log(`\n📦 [PO UPLOAD API] Incoming PO Upload at ${new Date().toISOString()}`);
  let filepath = '';

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const chainName = String(formData.get('chainName') || 'OTHER').toUpperCase().trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (file.size === 0) return NextResponse.json({ error: 'The uploaded file is empty' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File is too large (max 15 MB)' }, { status: 400 });

    const name = file.name.toLowerCase();
    const mimeType = file.type || 'application/octet-stream';
    const isPdf = name.endsWith('.pdf') || mimeType.includes('pdf');
    const isCsv = name.endsWith('.csv') || mimeType.includes('csv');
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType.includes('sheet');

    if (!isPdf && !isCsv && !isExcel) {
      return NextResponse.json({ error: 'Only .pdf, .csv, and .xlsx/.xls files are supported. Please upload a PDF, CSV, or Excel document.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await saveBufferToUploads(file.name, buffer);
    filepath = stored.filepath;

    const ikRes = await uploadToImageKit(buffer, file.name, '/po-documents');
    const fileUrl = ikRes?.url || publicPathForStoredFile(stored.storedName);

    let extracted: ExtractedPO[] = [];
    let parser = '';
    let pdfText = '';

    // 1. Exact parsers for known chain layouts
    if (isExcel || isCsv) {
      const known = parseKnownPoSpreadsheet(buffer);
      if (known && known.length) { extracted = known.map(fromParsed); parser = known[0].parser; }
    } else if (isPdf) {
      try { pdfText = (await pdf(buffer)).text || ''; } catch {}
      const known = pdfText ? parseKnownPoPdfText(pdfText) : null;
      if (known && known.items.length) { extracted = [fromParsed(known)]; parser = known.parser; }
    }

    // 2. Generic Excel / CSV reader
    if (!extracted.length && (isExcel || isCsv)) {
      try {
        const r = await extractFromExcel(filepath, chainName.toLowerCase());
        if (r?.products?.length) {
          parser = 'generic-excel';
          const doc = r.rawDocumentInfo || ({} as any);
          extracted = [{
            poNumber: doc.documentNumber || '',
            poDate: isoDate(doc.documentDate),
            deliveryDate: isoDate(doc.deliveryDate),
            dcName: dcNameFromAddress((doc as any).shippingAddress),
            shipTo: (doc as any).shippingAddress || '',
            items: r.products.map(p => ({
              chainItemCode: p.sku || '',
              chainItemName: p.name || '',
              eanCode: p.ean || p.eanCode || '',
              quantityPcs: p.quantity || 0,
              unitPrice: p.price || 0,
            })),
            warnings: [],
            rawDocumentInfo: doc,
          }];
        }
      } catch (excelErr: any) {
        console.warn(`⚠️ [PO UPLOAD API] Excel extraction notice:`, excelErr.message);
      }
    }

    // 3. AI extraction (PDFs of other chains, scanned documents)
    if (!extracted.length) {
      try {
        const r = await extractProductsWithAI(filepath, mimeType, chainName.toLowerCase());
        if (r?.products?.length) {
          parser = 'ai';
          const doc: any = r.rawDocumentInfo || {};
          const items = r.products.map(p => {
            const qty = p.quantity || 0;
            const price = p.price || 0;
            // When the AI gives a line total, trust total ÷ price for the quantity (PDF text often glues numbers)
            const lineTotal = (p as any).totalPrice;
            const qtyFromTotal = price > 0 && lineTotal > 0 ? Math.round(lineTotal / price) : 0;
            return {
              chainItemCode: p.sku || '',
              chainItemName: p.name || '',
              eanCode: p.ean || p.eanCode || '',
              quantityPcs: qtyFromTotal > 0 && Math.abs(qtyFromTotal * price - lineTotal) < 1 ? qtyFromTotal : qty,
              unitPrice: price,
            };
          });
          const warnings: string[] = [];
          const docTotals = documentTotalsFromText(pdfText || doc.allVisibleText || '');
          if (doc.totalAmount) docTotals.push(Number(doc.totalAmount));
          if (doc.subtotal) docTotals.push(Number(doc.subtotal));
          const warn = checkAgainstDocumentTotals(items.reduce((s, i) => s + i.quantityPcs * i.unitPrice, 0), docTotals.filter(n => n > 0));
          if (warn) warnings.push(warn);
          extracted = [{
            poNumber: doc.documentNumber || '',
            poDate: isoDate(doc.documentDate),
            deliveryDate: isoDate(doc.deliveryDate),
            dcName: dcNameFromAddress(doc.shippingAddress),
            shipTo: doc.shippingAddress || '',
            items,
            warnings,
            rawDocumentInfo: { ...doc, dcName: dcNameFromAddress(doc.shippingAddress), parser: 'ai', warnings },
          }];
        }
      } catch (aiErr: any) {
        console.warn(`⚠️ [PO UPLOAD API] AI extraction notice:`, aiErr.message);
      }
    }

    try { unlinkSync(filepath); } catch {}
    filepath = '';

    if (!extracted.length) {
      return NextResponse.json({ error: `No PO items could be read from "${file.name}". Please check the file or use the PO editor to enter it manually.` }, { status: 422 });
    }

    // PO numbers never come from file names like "purchase_order_FLS…": clean and validate
    for (const po of extracted) {
      po.poNumber = cleanPoNumber(po.poNumber);
      if (po.poNumber && (/^\d{13}$/.test(po.poNumber) || /^(vendor|purchaseorder|po|order)$/i.test(po.poNumber))) {
        po.warnings.push(`"${po.poNumber}" does not look like a PO number`);
        po.poNumber = '';
      }
      if (!po.poNumber && !po.warnings.some(w => /PO number/i.test(w))) po.warnings.push('PO number not found in the document — please enter it');
    }

    // Detect the actual retail chain from the document
    const fullDocText = (JSON.stringify(extracted[0].rawDocumentInfo || {}) + ' ' + pdfText.slice(0, 3000)).toUpperCase();
    let activeChain = chainName;
    if (parser.startsWith('amazon')) activeChain = 'AMAZON';
    else if (parser.startsWith('flipkart')) activeChain = 'FLIPKART';
    else if (parser.startsWith('swiggy')) activeChain = 'SWIGGY';
    else if (parser.startsWith('dmart')) activeChain = 'DMART';
    else if (parser.startsWith('zepto')) activeChain = 'ZEPTO';
    else if (parser.startsWith('reliance')) activeChain = 'RELIANCE';
    else if (parser.startsWith('bigbasket')) activeChain = 'BIGBASKET';
    else if (fullDocText.includes('AMAZON') || fullDocText.includes('ASIN')) activeChain = 'AMAZON';
    else if (fullDocText.includes('BLINK COMMERCE') || fullDocText.includes('BLINKIT')) activeChain = 'BLINKIT';
    else if (fullDocText.includes('ZEPTO')) activeChain = 'ZEPTO';
    else if (fullDocText.includes('FLIPKART')) activeChain = 'FLIPKART';
    else if (fullDocText.includes('SWIGGY') || fullDocText.includes('SCOOTSY')) activeChain = 'SWIGGY';
    else if (fullDocText.includes('BIGBASKET') || fullDocText.includes('INNOVATIVE RETAIL')) activeChain = 'BIGBASKET';
    else if (fullDocText.includes('AVENUE SUPERMARTS') || fullDocText.includes('DMART')) activeChain = 'DMART';
    else if (fullDocText.includes('AIRPLAZA') || fullDocText.includes('VISHAL MEGA MART')) activeChain = 'VISHAL';
    else if (fullDocText.includes('CITYMALL') || fullDocText.includes('CMUNITY')) activeChain = 'CITYMALL';
    else if (fullDocText.includes('DEERIKA') || fullDocText.includes('DJT RETAILERS') || fullDocText.includes('DJTR/')) activeChain = 'DEERIKA';

    console.log(`ℹ️ [PO UPLOAD API] Parser: ${parser} | Chain: ${chainName} -> ${activeChain} | POs: ${extracted.map(p => p.poNumber || '(none)').join(', ')}`);

    // Item mapping enrichment
    const [chainMappings, allMappings] = await Promise.all([
      prisma.itemMapping.findMany({ where: { chainName: activeChain, isActive: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.itemMapping.findMany({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } }),
    ]);

    const eanMatches = (dbEanStr?: string | null, searchEan?: string) => {
      if (!dbEanStr || !searchEan) return false;
      return dbEanStr.toLowerCase().split(',').map(s => s.trim()).includes(searchEan.toLowerCase());
    };

    const matchItem = (item: RawItem) => {
      const code = String(item.chainItemCode || '').trim().toLowerCase();
      const name = String(item.chainItemName || '').trim().toLowerCase();
      const ean = String(item.eanCode || '').trim().toLowerCase();

      const tryFind = (list: typeof allMappings) => {
        let m = list.find(x => {
          const dbCode = String(x.chainItemCode || '').trim().toLowerCase();
          return (code && dbCode === code) || (code && eanMatches(x.eanCode, code));
        });
        if (!m && ean) m = list.find(x => eanMatches(x.eanCode, ean) || String(x.chainItemCode || '').trim().toLowerCase() === ean);
        if (!m && name) m = list.find(x => String(x.chainItemName || '').trim().toLowerCase() === name);
        if (!m && name) {
          const normN = name.replace(/[^a-z0-9]/g, '');
          m = list.find(x => {
            const dbNormN = String(x.chainItemName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            return normN.length > 5 && dbNormN.length > 5 && (normN.includes(dbNormN) || dbNormN.includes(normN));
          });
        }
        return m;
      };
      return tryFind(chainMappings) || tryFind(allMappings);
    };

    const enrich = async (items: RawItem[]) => Promise.all(items.map(async item => {
      const mapping = matchItem(item);
      const extractedEan = String(item.eanCode || '').trim();
      if (mapping && extractedEan && (!mapping.eanCode || !mapping.eanCode.trim())) {
        await prisma.itemMapping.update({ where: { id: mapping.id }, data: { eanCode: extractedEan } }).catch(() => {});
      }
      return {
        chainItemCode: item.chainItemCode || mapping?.chainItemCode || '',
        chainItemName: item.chainItemName || mapping?.chainItemName || '',
        tallyItemName: mapping?.tallyItemName || '',
        eanCode: extractedEan || mapping?.eanCode || '',
        pcsPerCase: mapping?.pcsPerCase || 1,
        quantityPcs: Number(item.quantityPcs) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        ...(item.totalPrice !== undefined ? { totalPrice: Number(item.totalPrice) } : {}),
        matched: !!mapping,
      };
    }));

    const purchaseOrders = await Promise.all(extracted.map(async po => ({
      poNumber: po.poNumber,
      poDate: po.poDate,
      appointmentDate: po.deliveryDate,
      dcName: po.dcName,
      shipTo: po.shipTo,
      warnings: po.warnings,
      rawDocumentInfo: po.rawDocumentInfo,
      items: await enrich(po.items),
    })));

    const first = purchaseOrders[0];
    return NextResponse.json({
      success: true,
      parser,
      detectedChain: activeChain,
      fileName: file.name,
      filePath: fileUrl,
      imagekitUrl: ikRes?.url || null,
      // First PO at the top level (used by the PO editor); all POs in `purchaseOrders`
      poNumber: first.poNumber,
      poDate: first.poDate,
      appointmentDate: first.appointmentDate,
      dcName: first.dcName,
      warnings: first.warnings,
      rawDocumentInfo: first.rawDocumentInfo,
      items: first.items,
      purchaseOrders,
    });
  } catch (err: any) {
    if (filepath) { try { unlinkSync(filepath); } catch {} }
    console.error(`❌ [PO UPLOAD ERROR] Processing failed:`, err.message || err);
    return NextResponse.json({ error: 'Failed to process PO: ' + err.message }, { status: 500 });
  }
}
