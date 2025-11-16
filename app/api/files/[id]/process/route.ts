import { NextRequest, NextResponse } from 'next/server';
import { processFileWithAI, ProcessingOptions } from '@/lib/documentProcessor';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI processing not configured. Please set OPENAI_API_KEY.' }, { status: 400 });
    }

    // Get processing options from request body (optional)
    // Default: Create new products if they don't exist, and ADD to stock
    const body = await req.json().catch(() => ({}));
    const options: ProcessingOptions = {
      matchExistingOnly: body.matchExistingOnly === true, // Default to false
      addToStock: body.addToStock !== false, // Default to true
    };

    const result = await processFileWithAI(params.id, options);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
  }
}



