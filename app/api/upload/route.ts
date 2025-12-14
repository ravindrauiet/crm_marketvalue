import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveBufferToUploads } from '@/lib/fileStorage';
import { processFileWithAI } from '@/lib/documentProcessor';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const name = String(form.get('name') || 'Untitled');
  const vendor = String(form.get('vendor') || 'default');
  const files = form.getAll('files');
  if (!files || files.length === 0) return NextResponse.json({ error: 'No files' }, { status: 400 });

  const record = await prisma.record.create({ data: { name } });
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
    fileIds.push(file.id);
  }

  // Process files with AI synchronously
  const processingResults = [];
  if (process.env.OPENAI_API_KEY) {
    const matchExistingOnly = form.get('matchExistingOnly') === 'true';
    const addToStock = form.get('addToStock') !== 'false';

    try {
      for (const fileId of fileIds) {
        console.log(`Processing file ${fileId} with AI...`);
        const result = await processFileWithAI(fileId, {
          matchExistingOnly,
          addToStock,
          vendor
        });
        processingResults.push(result);
      }
    } catch (error: any) {
      console.error('AI Processing Error:', error);
      return NextResponse.json(
        { error: `AI Processing Failed: ${error.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    id: record.id,
    filesProcessed: fileIds.length,
    aiProcessing: !!process.env.OPENAI_API_KEY,
    results: processingResults
  });
}







