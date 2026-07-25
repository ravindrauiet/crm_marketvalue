import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveBufferToUploads } from '@/lib/fileStorage';
import { processFileWithAI } from '@/lib/documentProcessor';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  console.log(`\n==================================================`);
  console.log(`📁 [UPLOAD API] Incoming Upload Request at ${timestamp}`);

  const form = await req.formData();
  const name = String(form.get('name') || 'Untitled');
  const vendor = String(form.get('vendor') || 'default');
  const files = form.getAll('files');

  console.log(`ℹ️ [UPLOAD API] Record Name: "${name}" | Vendor: "${vendor.toUpperCase()}" | Total Attached Files: ${files.length}`);

  if (!files || files.length === 0) {
    console.error(`❌ [UPLOAD API] Error: No files attached in form data`);
    return NextResponse.json({ error: 'No files attached' }, { status: 400 });
  }

  const record = await prisma.record.create({ data: { name } });
  console.log(`✅ [UPLOAD API] Created Database Record ID: ${record.id}`);

  const fileIds: string[] = [];

  for (const f of files) {
    if (!(f instanceof File)) continue;
    const arrayBuf = await f.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const { filepath, storedName } = await saveBufferToUploads(f.name, buffer);

    const file = await prisma.file.create({
      data: {
        filename: f.name,
        mimetype: f.type || 'application/octet-stream',
        sizeBytes: buffer.byteLength,
        path: filepath,
        recordId: record.id,
        extractionStatus: 'PENDING'
      }
    });

    console.log(`  📄 [FILE CREATED] File ID: ${file.id} | Name: "${f.name}" | Size: ${(buffer.byteLength / 1024).toFixed(2)} KB | Path: ${filepath}`);
    fileIds.push(file.id);
  }

  const hasApiKey = !!process.env.OPENAI_API_KEY;
  console.log(`🔑 [AI STATUS] OpenAI API Key Present: ${hasApiKey ? 'YES (' + process.env.OPENAI_MODEL + ')' : 'NO (AI extraction skipped)'}`);

  // Trigger AI processing in the background (non-blocking) so Netlify functions return immediately (<200ms)
  if (hasApiKey) {
    const matchExistingOnly = form.get('matchExistingOnly') === 'true';
    const addToStock = form.get('addToStock') !== 'false';

    // Run AI processing asynchronously
    (async () => {
      console.log(`🚀 [BACKGROUND TASK] Starting AI Processing for ${fileIds.length} file(s)...`);
      for (const fileId of fileIds) {
        const startTime = Date.now();
        try {
          console.log(`⚡ [AI PROCESS START] Processing File ID ${fileId} with Vendor "${vendor.toUpperCase()}"...`);
          const result = await processFileWithAI(fileId, {
            matchExistingOnly,
            addToStock,
            vendor
          });
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`✅ [AI PROCESS SUCCESS] File ID ${fileId} completed in ${duration}s | Extracted: ${result.productsExtracted} items | Matched: ${result.productsMatched}`);
        } catch (error: any) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.error(`❌ [AI PROCESS ERROR] File ID ${fileId} failed after ${duration}s:`, error.message || error);
        }
      }
      console.log(`🏁 [BACKGROUND TASK COMPLETE] All files processed for Record ID ${record.id}`);
      console.log(`==================================================\n`);
    })();
  } else {
    console.log(`==================================================\n`);
  }

  return NextResponse.json({
    ok: true,
    id: record.id,
    filesProcessed: fileIds.length,
    aiProcessing: hasApiKey,
  });
}







