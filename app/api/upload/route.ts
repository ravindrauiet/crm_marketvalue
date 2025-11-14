import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveBufferToUploads } from '@/lib/fileStorage';
import { processFileWithAI } from '@/lib/documentProcessor';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const name = String(form.get('name') || 'Untitled');
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

  // Process files with AI in the background (don't wait for completion)
  // This allows the API to return quickly while processing happens async
  if (process.env.OPENAI_API_KEY) {
    fileIds.forEach(fileId => {
      processFileWithAI(fileId).catch(err => {
        console.error(`Error processing file ${fileId}:`, err);
      });
    });
  }

  return NextResponse.json({ 
    ok: true, 
    id: record.id,
    filesProcessed: fileIds.length,
    aiProcessing: !!process.env.OPENAI_API_KEY
  });
}






