import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { badRequest, isObjectId } from '@/lib/validation';
import { loadInvoiceIndex } from '@/lib/recoData';
import { KIND_LABEL, LineKind, classifyLine, isDeductionKind, lineAmount, matchFields, matchLine, noteKind, withNotes } from '@/lib/recoMatch';

const KINDS = Object.keys(KIND_LABEL) as LineKind[];

// PATCH /api/reconciliation/:id
// { action: 'match', invoiceNo, kind? } link to a Tally invoice by hand (optionally re-classify the line)
// { action: 'unmatch' }                 remove the link
// { action: 'ignore' } / { action: 'restore' }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isObjectId(params.id)) return badRequest('Invalid line id');
    const body = await req.json().catch(() => null);
    const line = await prisma.paymentReco.findUnique({ where: { id: params.id } });
    if (!line) return badRequest('Line not found', 404);

    const kind: LineKind = body?.kind && KINDS.includes(body.kind) ? body.kind : (noteKind(line.notes) || classifyLine(line));
    const besideTds = isDeductionKind(kind) ? 0 : line.deductionAmount;
    let data: Record<string, any>;

    switch (body?.action) {
      case 'match': {
        const invoiceNo = String(body.invoiceNo || '').trim().toUpperCase();
        if (!invoiceNo) return badRequest('Enter the invoice number to link');
        const invoice = (await loadInvoiceIndex()).byNumber.get(invoiceNo);
        if (!invoice) return badRequest(`Invoice ${invoiceNo} is not in the uploaded Tally sale invoices`, 404);
        const amount = lineAmount(line);
        data = {
          ...matchFields({ kind, invoice, referencedInvoice: invoice.invoiceNumber, poNumber: invoice.poNumber, chain: invoice.chain, amount }, besideTds),
          deductionReason: isDeductionKind(kind) ? (line.deductionReason || KIND_LABEL[kind]) : line.deductionReason,
          notes: withNotes(line.notes, kind, true),
        };
        break;
      }
      case 'unmatch':
        data = {
          matchStatus: 'UNMATCHED', matchedInvoiceNo: null, matchedAmount: 0, pendingAmount: lineAmount(line),
          notes: withNotes(line.notes, kind, true),
        };
        break;
      case 'ignore':
        data = { matchStatus: 'IGNORED', notes: withNotes(line.notes, kind, true) };
        break;
      case 'restore': {
        // Back to automatic matching
        const m = matchLine({ ...line, invoiceNumber: line.matchedInvoiceNo, poNumber: line.matchedPoNumber }, await loadInvoiceIndex(), true);
        data = { ...matchFields(m, besideTds), notes: withNotes(line.notes, m.kind, false) };
        break;
      }
      default:
        return badRequest('action must be match, unmatch, ignore or restore');
    }

    const updated = await prisma.paymentReco.update({ where: { id: line.id }, data });
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('❌ [RECO LINE UPDATE ERROR]', err);
    return NextResponse.json({ error: 'Failed to update the line: ' + err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isObjectId(params.id)) return badRequest('Invalid line id');
    await prisma.paymentReco.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('❌ [RECO LINE DELETE ERROR]', err);
    return NextResponse.json({ error: 'Failed to delete the line: ' + err.message }, { status: 500 });
  }
}
