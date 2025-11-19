import { NextRequest, NextResponse } from 'next/server';
import { getFileExtractionStatus } from '@/lib/documentProcessor';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const status = await getFileExtractionStatus(params.id);
    if (!status) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to get status' }, { status: 500 });
  }
}






