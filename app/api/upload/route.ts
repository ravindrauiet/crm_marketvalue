import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveBufferToUploads } from '@/lib/fileStorage';
import { processFileWithAI } from '@/lib/documentProcessor';
import { uploadToImageKit } from '@/lib/imagekit';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_EXT = /\.(pdf|jpg|jpeg|png|webp|xlsx|xls|csv|docx|txt)$/i;
// Netlify functions stop at 26s; stop starting new AI jobs after this budget.
// Files not processed in time stay PENDING and can be processed from the record page.
const PROCESSING_BUDGET_MS = 15000;

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`\n==================================================`);
  console.log(`📁 [UPLOAD API] Incoming Upload Request at ${timestamp}`);

  try {
    const form = await req.formData();
    const name = String(form.get('name') || 'Untitled').trim().slice(0, 200) || 'Untitled';
    const vendor = String(form.get('vendor') || 'default');
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    console.log(`ℹ️ [UPLOAD API] Record Name: "${name}" | Vendor: "${vendor.toUpperCase()}" | Total Attached Files: ${files.length}`);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files attached' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Please upload at most ${MAX_FILES} files at a time` }, { status: 400 });
    }
    for (const f of files) {
      if (!ALLOWED_EXT.test(f.name)) return NextResponse.json({ error: `"${f.name}" is not a supported file type` }, { status: 400 });
      if (f.size === 0) return NextResponse.json({ error: `"${f.name}" is empty` }, { status: 400 });
      if (f.size > MAX_FILE_BYTES) return NextResponse.json({ error: `"${f.name}" is too large (max 15 MB)` }, { status: 400 });
    }

    const record = await prisma.record.create({ data: { name } });
    console.log(`✅ [UPLOAD API] Created Database Record ID: ${record.id}`);

    const fileIds: string[] = [];

    for (const f of files) {
      const buffer = Buffer.from(await f.arrayBuffer());
      const { filepath } = await saveBufferToUploads(f.name, buffer);

      // Upload to ImageKit.io (the permanent copy; local temp files don't survive on serverless)
      const ikRes = await uploadToImageKit(buffer, f.name, '/crm-documents');

      const file = await prisma.file.create({
        data: {
          filename: f.name,
          mimetype: f.type || 'application/octet-stream',
          sizeBytes: buffer.byteLength,
          path: filepath,
          imagekitUrl: ikRes?.url || null,
          imagekitFileId: ikRes?.fileId || null,
          recordId: record.id,
          extractionStatus: 'PENDING'
        }
      });

      console.log(`  📄 [FILE CREATED] File ID: ${file.id} | Name: "${f.name}" | ImageKit: ${file.imagekitUrl || 'N/A'}`);
      fileIds.push(file.id);
    }

    const hasApiKey = !!process.env.OPENAI_API_KEY;
    const matchExistingOnly = form.get('matchExistingOnly') === 'true';
    const addToStock = form.get('addToStock') !== 'false';

    // Process inside the request: background work after the response is frozen/killed on Netlify
    const started = Date.now();
    let processed = 0;
    if (hasApiKey) {
      for (const fileId of fileIds) {
        if (Date.now() - started > PROCESSING_BUDGET_MS) break;
        try {
          const result = await processFileWithAI(fileId, { matchExistingOnly, addToStock, vendor });
          console.log(`✅ [AI PROCESS SUCCESS] File ID ${fileId} | Extracted: ${result.productsExtracted} items | Matched: ${result.productsMatched}`);
        } catch (error: any) {
          console.error(`❌ [AI PROCESS ERROR] File ID ${fileId}:`, error.message || error);
        }
        processed++;
      }
    }

    return NextResponse.json({
      ok: true,
      id: record.id,
      filesProcessed: fileIds.length,
      aiProcessing: hasApiKey,
      aiProcessed: processed,
      aiPending: hasApiKey ? fileIds.length - processed : fileIds.length,
    });
  } catch (err: any) {
    console.error('❌ [UPLOAD API ERROR]', err);
    return NextResponse.json({ error: 'Upload failed: ' + (err.message || err) }, { status: 500 });
  }
}
