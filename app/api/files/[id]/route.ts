import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { existsSync, createReadStream } from 'fs';
import { isObjectId } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isObjectId(params.id)) return new Response('Invalid file id', { status: 400 });
  const file = await prisma.file.findUnique({ where: { id: params.id } });
  if (!file) return new Response('Not found', { status: 404 });

  // Local temp copy (dev / same server instance)
  if (file.path && existsSync(file.path)) {
    const stream = createReadStream(file.path);
    return new Response(stream as any, {
      headers: {
        'Content-Type': file.mimetype,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.filename)}"`
      }
    });
  }

  // Permanent copy on ImageKit
  if (file.imagekitUrl) return NextResponse.redirect(file.imagekitUrl);

  return new Response('File is no longer available. Please upload it again.', { status: 410 });
}
