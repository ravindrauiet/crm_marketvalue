import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveBufferToUploads } from '@/lib/fileStorage';
import { extractProductsWithAI } from '@/lib/ai';
import { extractFromExcel } from '@/lib/excel-extractor';
import { unlinkSync } from 'fs';

// POST /api/po/upload
// Upload and extract PO details from Excel/PDF/Word/Image using AI & Vendor rules
export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`\n==================================================`);
  console.log(`📦 [PO UPLOAD API] Incoming PO Upload at ${timestamp}`);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const chainName = String(formData.get('chainName') || 'OTHER').toUpperCase().trim();

    if (!file) {
      console.error(`❌ [PO UPLOAD API] Error: No file uploaded`);
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log(`ℹ️ [PO UPLOAD API] File Name: "${file.name}" | Size: ${(file.size / 1024).toFixed(2)} KB | Chain: "${chainName}"`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { filepath } = await saveBufferToUploads(file.name, buffer);

    const name = file.name.toLowerCase();
    const mimeType = file.type || 'application/octet-stream';

    const base64Data = buffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    let extractedInfo: any = { poNumber: '', poDate: '', deliveryDate: '', items: [], rawDocumentInfo: null };

    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') || mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      console.log(`📊 [PO UPLOAD API] Extracting Excel PO with deterministic extractor...`);
      const excelResult = await extractFromExcel(filepath, chainName.toLowerCase());
      extractedInfo.rawDocumentInfo = excelResult.rawDocumentInfo || null;
      extractedInfo.poNumber = excelResult.rawDocumentInfo?.documentNumber || '';
      extractedInfo.poDate = excelResult.rawDocumentInfo?.documentDate || '';
      extractedInfo.deliveryDate = excelResult.rawDocumentInfo?.deliveryDate || '';
      extractedInfo.items = (excelResult.products || []).map(p => ({
        chainItemCode: p.sku || '',
        chainItemName: p.name || '',
        eanCode: p.description?.includes('EAN:') ? p.description.split('EAN:')[1]?.trim() : '',
        quantityPcs: p.quantity || 0,
        unitPrice: p.price || 0,
      }));
    } else {
      console.log(`🤖 [PO UPLOAD API] Extracting PDF/Image PO using AI (${process.env.OPENAI_MODEL || 'gpt-4o'})...`);
      const aiResult = await extractProductsWithAI(filepath, mimeType, chainName.toLowerCase());
      extractedInfo.rawDocumentInfo = aiResult.rawDocumentInfo || null;
      extractedInfo.poNumber = aiResult.rawDocumentInfo?.documentNumber || '';
      extractedInfo.poDate = aiResult.rawDocumentInfo?.documentDate || '';
      extractedInfo.deliveryDate = aiResult.rawDocumentInfo?.deliveryDate || '';
      extractedInfo.items = (aiResult.products || []).map(p => ({
        chainItemCode: p.sku || '',
        chainItemName: p.name || '',
        eanCode: p.description?.includes('EAN:') ? p.description.split('EAN:')[1]?.trim() : '',
        quantityPcs: p.quantity || 0,
        unitPrice: p.price || 0,
      }));
    }

    // Clean up temporary file
    try { unlinkSync(filepath); } catch {}

    // Auto-match extracted items against ItemMapping for this chain
    const mappings = await prisma.itemMapping.findMany({
      where: { chainName: chainName, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    const finalItems = extractedInfo.items.map((item: any) => {
      const code = String(item.chainItemCode || '').trim().toLowerCase();
      const name = String(item.chainItemName || '').trim().toLowerCase();
      const ean = String(item.eanCode || '').trim().toLowerCase();

      let mapping = null;
      if (code) {
        mapping = mappings.find(m =>
          m.chainItemCode.toLowerCase() === code ||
          (m.eanCode && m.eanCode.toLowerCase() === code)
        );
      }
      if (!mapping && ean) {
        mapping = mappings.find(m => m.eanCode && m.eanCode.toLowerCase() === ean);
      }
      if (!mapping && name) {
        mapping = mappings.find(m => m.chainItemName.toLowerCase() === name);
      }

      return {
        chainItemCode: item.chainItemCode || '',
        chainItemName: item.chainItemName || '',
        tallyItemName: mapping?.tallyItemName || '',
        eanCode: item.eanCode || mapping?.eanCode || '',
        hsnCode: item.hsnCode || '',
        quantityPcs: typeof item.quantityPcs === 'number' ? item.quantityPcs : parseFloat(item.quantityPcs || 0) || 0,
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice || 0) || 0,
        matched: !!mapping,
      };
    });

    console.log(`✅ [PO UPLOAD SUCCESS] PO Number: "${extractedInfo.poNumber}" | Items Extracted: ${finalItems.length} | Matched: ${finalItems.filter((i: any) => i.matched).length}`);
    console.log(`==================================================\n`);

    return NextResponse.json({
      success: true,
      poNumber: extractedInfo.poNumber || '',
      poDate: extractedInfo.poDate || '',
      appointmentDate: extractedInfo.deliveryDate || '',
      fileName: file.name,
      filePath: dataUri,
      rawDocumentInfo: extractedInfo.rawDocumentInfo,
      items: finalItems,
    });
  } catch (err: any) {
    console.error(`❌ [PO UPLOAD ERROR] Processing failed:`, err.message || err);
    return NextResponse.json({ error: 'Failed to process PO: ' + err.message }, { status: 500 });
  }
}
