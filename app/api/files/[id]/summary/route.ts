import { prisma } from '@/lib/prisma';
import { summarizeExcel } from '@/lib/excel';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const file = await prisma.file.findUnique({ where: { id: params.id } });
  if (!file) return new Response('Not found', { status: 404 });
  if (!/\.(xlsx|xls)$/i.test(file.filename)) return Response.json({ headers: [], rows: [] });
  const summary = summarizeExcel(file.path);
  return Response.json(summary);
}




