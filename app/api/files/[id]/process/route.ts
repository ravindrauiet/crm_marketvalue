import { NextRequest, NextResponse } from 'next/server';
import { processFileWithAI } from '@/lib/documentProcessor';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI processing not configured. Please set OPENAI_API_KEY.' }, { status: 400 });
    }

    const result = await processFileWithAI(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
  }
}


