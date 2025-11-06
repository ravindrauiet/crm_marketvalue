import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createReadStream } from 'fs';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const file = await prisma.file.findUnique({ where: { id: params.id } });
  if (!file) return new Response('Not found', { status: 404 });
  const stream = createReadStream(file.path);
  return new Response(stream as any, {
    headers: {
      'Content-Type': file.mimetype,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.filename)}"`
    }
  });
}




