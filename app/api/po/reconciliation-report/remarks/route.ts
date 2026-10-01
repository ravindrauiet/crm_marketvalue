import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const REMARK_FIELDS = ['remarks1', 'remarks2', 'remarks3', 'remarks4'] as const;

// PATCH /api/po/reconciliation-report/remarks - Save manual Remarks 1..4 for a PO
// Body: { poId: string, remarks1?: string, remarks2?: string, remarks3?: string, remarks4?: string }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const poId = String(body.poId || '').trim();
    if (!poId) return NextResponse.json({ error: 'poId is required' }, { status: 400 });

    const data: Record<string, string> = {};
    for (const field of REMARK_FIELDS) {
      if (typeof body[field] === 'string') data[field] = body[field].trim();
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No remarks provided' }, { status: 400 });
    }

    const po = await prisma.chainPurchaseOrder.update({
      where: { id: poId },
      data,
      select: { id: true, remarks1: true, remarks2: true, remarks3: true, remarks4: true },
    });

    return NextResponse.json({ success: true, po });
  } catch (err: any) {
    console.error('❌ [PO REMARKS SAVE ERROR]', err);
    return NextResponse.json({ error: 'Failed to save remarks: ' + err.message }, { status: 500 });
  }
}
