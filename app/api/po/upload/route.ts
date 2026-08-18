import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveBufferToUploads, publicPathForStoredFile } from '@/lib/fileStorage';
import { extractProductsWithAI } from '@/lib/ai';
import { extractFromExcel } from '@/lib/excel-extractor';
import { uploadToImageKit } from '@/lib/imagekit';
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

    const name = file.name.toLowerCase();
    const mimeType = file.type || 'application/octet-stream';

    const isPdf = name.endsWith('.pdf') || mimeType.includes('pdf');
    const isCsv = name.endsWith('.csv') || mimeType.includes('csv');
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType.includes('sheet');

    if (!isPdf && !isCsv && !isExcel) {
      console.error(`❌ [PO UPLOAD API] Error: File format not allowed. Name: ${file.name}`);
      return NextResponse.json({ error: 'Only .pdf, .csv, and .xlsx/.xls files are supported. Please upload a PDF, CSV, or Excel document.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { filepath, storedName } = await saveBufferToUploads(file.name, buffer);

    // Upload to ImageKit.io
    const ikRes = await uploadToImageKit(buffer, file.name, '/po-documents');

    // Use clean file URL (ImageKit CDN or local upload path) instead of huge Base64 dataUri to prevent 502 Bad Gateway server overflow
    const fileUrl = ikRes?.url || publicPathForStoredFile(storedName);

    let extractedInfo: any = { poNumber: '', poDate: '', deliveryDate: '', items: [], rawDocumentInfo: null };

    // 1. For Excel (.xls, .xlsx) and CSV files: Fast-track deterministic extraction (<50ms)
    if (isExcel || isCsv) {
      try {
        console.log(`📊 [PO UPLOAD API] Fast Extracting Excel/CSV PO "${file.name}"...`);
        const excelResult = await extractFromExcel(filepath, chainName.toLowerCase());
        if (excelResult && excelResult.products && excelResult.products.length > 0) {
          extractedInfo.rawDocumentInfo = excelResult.rawDocumentInfo || null;
          extractedInfo.poNumber = excelResult.rawDocumentInfo?.documentNumber || '';
          extractedInfo.poDate = excelResult.rawDocumentInfo?.documentDate || '';
          extractedInfo.deliveryDate = excelResult.rawDocumentInfo?.deliveryDate || '';
          extractedInfo.items = (excelResult.products || []).map(p => ({
            chainItemCode: p.sku || '',
            chainItemName: p.name || '',
            eanCode: p.ean || p.eanCode || (p.description?.includes('EAN:') ? p.description.split('EAN:')[1]?.trim() : ''),
            quantityPcs: p.quantity || 0,
            unitPrice: p.price || 0,
          }));
        }
      } catch (excelErr: any) {
        console.warn(`⚠️ [PO UPLOAD API] Excel Extraction notice:`, excelErr.message);
      }
    }

    // 2. If no items extracted yet (or for PDF/Doc/Image files), extract using AI
    if (!extractedInfo.items || extractedInfo.items.length === 0) {
      try {
        console.log(`🤖 [PO UPLOAD API] Extracting PO using AI (${process.env.OPENAI_MODEL || 'gpt-4o-mini'})...`);
        const aiResult = await extractProductsWithAI(filepath, mimeType, chainName.toLowerCase());
        if (aiResult && aiResult.products && aiResult.products.length > 0) {
          extractedInfo.rawDocumentInfo = aiResult.rawDocumentInfo || null;
          extractedInfo.poNumber = aiResult.rawDocumentInfo?.documentNumber || '';
          extractedInfo.poDate = aiResult.rawDocumentInfo?.documentDate || '';
          extractedInfo.deliveryDate = aiResult.rawDocumentInfo?.deliveryDate || '';
          extractedInfo.items = (aiResult.products || []).map(p => ({
            chainItemCode: p.sku || '',
            chainItemName: p.name || '',
            eanCode: p.ean || p.eanCode || (p.description?.includes('EAN:') ? p.description.split('EAN:')[1]?.trim() : ''),
            quantityPcs: p.quantity || 0,
            unitPrice: p.price || 0,
          }));
        }
      } catch (aiErr: any) {
        console.warn(`⚠️ [PO UPLOAD API] AI Extraction notice:`, aiErr.message);
      }
    }

    // Clean up temporary file
    try { unlinkSync(filepath); } catch {}

    // Auto-detect actual Retail Chain from document text
    let activeChain = chainName;
    const fullDocText = (JSON.stringify(extractedInfo.rawDocumentInfo || {}) + ' ' + (extractedInfo.rawDocumentInfo?.allVisibleText || '')).toUpperCase();

    if (fullDocText.includes('AMAZON') || fullDocText.includes('ASIN')) activeChain = 'AMAZON';
    else if (fullDocText.includes('BLINK COMMERCE') || fullDocText.includes('BLINKIT')) activeChain = 'BLINKIT';
    else if (fullDocText.includes('ZEPTO')) activeChain = 'ZEPTO';
    else if (fullDocText.includes('FLIPKART')) activeChain = 'FLIPKART';
    else if (fullDocText.includes('SWIGGY') || fullDocText.includes('SCOOTSY')) activeChain = 'SWIGGY';
    else if (fullDocText.includes('BIGBASKET') || fullDocText.includes('INNOVATIVE RETAIL')) activeChain = 'BIGBASKET';
    else if (fullDocText.includes('AVENUE SUPERMARTS') || fullDocText.includes('DMART')) activeChain = 'DMART';
    else if (fullDocText.includes('AIRPLAZA') || fullDocText.includes('VISHAL MEGA MART')) activeChain = 'VISHAL';
    else if (fullDocText.includes('CITYMALL') || fullDocText.includes('CMUNITY')) activeChain = 'CITYMALL';
    else if (fullDocText.includes('DEERIKA') || fullDocText.includes('DJT RETAILERS') || fullDocText.includes('DJTR/')) activeChain = 'DEERIKA';

    console.log(`ℹ️ [PO UPLOAD API] Input Chain: "${chainName}" | Auto-Detected Chain: "${activeChain}"`);

    // Fetch mappings for detected chain AND all active mappings as fallback
    const chainMappings = await prisma.itemMapping.findMany({
      where: { chainName: activeChain, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    const allMappings = await prisma.itemMapping.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    const eanMatches = (dbEanStr?: string | null, searchEan?: string) => {
      if (!dbEanStr || !searchEan) return false;
      const parts = dbEanStr.toLowerCase().split(',').map(s => s.trim());
      return parts.includes(searchEan.toLowerCase());
    };

    const matchItem = (item: any) => {
      const code = String(item.chainItemCode || '').trim().toLowerCase();
      const name = String(item.chainItemName || '').trim().toLowerCase();
      const ean = String(item.eanCode || '').trim().toLowerCase();

      const tryFind = (list: typeof allMappings) => {
        // 1. Exact chainItemCode match or EAN match
        let m = list.find(x => {
          const dbCode = String(x.chainItemCode || '').trim().toLowerCase();
          return (code && dbCode === code) || (code && eanMatches(x.eanCode, code));
        });

        // 2. Exact EAN match
        if (!m && ean) {
          m = list.find(x => eanMatches(x.eanCode, ean) || String(x.chainItemCode || '').trim().toLowerCase() === ean);
        }

        // 3. Exact chainItemName match
        if (!m && name) {
          m = list.find(x => String(x.chainItemName || '').trim().toLowerCase() === name);
        }

        // 4. Normalized fuzzy chainItemName match
        if (!m && name) {
          const normN = name.replace(/[^a-z0-9]/g, '');
          m = list.find(x => {
            const dbNormN = String(x.chainItemName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            return normN.length > 5 && (normN.includes(dbNormN) || dbNormN.includes(normN));
          });
        }

        return m;
      };

      return tryFind(chainMappings) || tryFind(allMappings);
    };

    const finalItems = await Promise.all(extractedInfo.items.map(async (item: any) => {
      const mapping = matchItem(item);
      const extractedEan = String(item.eanCode || '').trim();

      // If mapping exists but has no EAN code in DB, auto-save the extracted EAN to DB
      if (mapping && extractedEan && (!mapping.eanCode || !mapping.eanCode.trim())) {
        try {
          await prisma.itemMapping.update({
            where: { id: mapping.id },
            data: { eanCode: extractedEan }
          });
          console.log(`💡 [DB AUTO-ENRICH] Enriched ItemMapping (${mapping.chainItemCode}) with extracted EAN: ${extractedEan}`);
        } catch {}
      }

      return {
        chainItemCode: item.chainItemCode || mapping?.chainItemCode || '',
        chainItemName: item.chainItemName || mapping?.chainItemName || '',
        tallyItemName: mapping?.tallyItemName || '',
        eanCode: extractedEan || mapping?.eanCode || '',
        pcsPerCase: mapping?.pcsPerCase || 1,
        quantityPcs: typeof item.quantityPcs === 'number' ? item.quantityPcs : parseFloat(item.quantityPcs || 0) || 0,
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice || 0) || 0,
        matched: !!mapping,
      };
    }));

    console.log(`✅ [PO UPLOAD SUCCESS] PO Number: "${extractedInfo.poNumber}" | Chain: "${activeChain}" | Items Extracted: ${finalItems.length} | Matched: ${finalItems.filter((i: any) => i.matched).length}`);
    console.log(`==================================================\n`);

    return NextResponse.json({
      success: true,
      poNumber: extractedInfo.poNumber || '',
      poDate: extractedInfo.poDate || '',
      appointmentDate: extractedInfo.deliveryDate || '',
      detectedChain: activeChain,
      fileName: file.name,
      filePath: fileUrl,
      imagekitUrl: ikRes?.url || null,
      rawDocumentInfo: extractedInfo.rawDocumentInfo,
      items: finalItems,
    });
  } catch (err: any) {
    console.error(`❌ [PO UPLOAD ERROR] Processing failed:`, err.message || err);
    return NextResponse.json({ error: 'Failed to process PO: ' + err.message }, { status: 500 });
  }
}
