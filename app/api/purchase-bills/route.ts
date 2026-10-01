import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadToImageKit } from '@/lib/imagekit';
import { saveBufferToUploads, publicPathForStoredFile } from '@/lib/fileStorage';
import { OCR_BILL_WHERE } from '@/lib/billSources';
import { badRequest, isObjectId } from '@/lib/validation';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|jpg|jpeg|png|webp|xlsx|xls|csv)$/i;

// Lists OCR purchase bills only (daily sale uploads live on the Fill Rate page)
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status');
    const bills = await prisma.purchaseBill.findMany({
      where: { AND: [OCR_BILL_WHERE, ...(status ? [{ status }] : [])] },
      select: {
        id: true,
        supplierName: true,
        invoiceNumber: true,
        invoiceDate: true,
        totalAmount: true,
        taxAmount: true,
        status: true,
        fileName: true,
        mimeType: true,
        imagekitUrl: true,
        isPostedToTally: true,
        duplicateOf: true,
        errorMessage: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(bills);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch bills' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) return badRequest('No file uploaded');
    if (!ALLOWED_EXT.test(file.name)) return badRequest('Only PDF, image (JPG/PNG/WEBP) or Excel/CSV bills are supported');
    if (file.size === 0) return badRequest('The uploaded file is empty');
    if (file.size > MAX_FILE_BYTES) return badRequest('File is too large (max 15 MB)');

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { storedName } = await saveBufferToUploads(file.name, buffer);

    // Upload to ImageKit.io (permanent copy; local temp storage is not persistent on Netlify)
    const ikRes = await uploadToImageKit(buffer, file.name, '/purchase-bills');
    const fileUrl = ikRes?.url || publicPathForStoredFile(storedName);

    const bill = await prisma.purchaseBill.create({
      data: {
        status: 'PENDING',
        filePath: fileUrl,
        fileName: file.name,
        mimeType: file.type,
        imagekitUrl: ikRes?.url || null,
      }
    });

    // Extraction is started by the client right after upload (a background fetch here
    // would be killed on serverless hosting and would also run extraction twice)
    return NextResponse.json(bill, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to upload bill' }, { status: 500 });
  }
}

// DELETE /api/purchase-bills - Clear all OCR purchase bills or delete a specific bill
// (daily sale uploads used by the Fill Rate report are never touched here)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const resetAll = searchParams.get('resetAll');

    if (resetAll === 'true') {
      const ocrBills = await prisma.purchaseBill.findMany({ where: OCR_BILL_WHERE, select: { id: true } });
      const ids = ocrBills.map(b => b.id);
      const itemsRes = await prisma.purchaseBillItem.deleteMany({ where: { billId: { in: ids } } });
      const billRes = await prisma.purchaseBill.deleteMany({ where: { id: { in: ids } } });
      return NextResponse.json({
        success: true,
        message: `Cleared ${billRes.count} purchase bills and ${itemsRes.count} line items`
      });
    }

    if (id) {
      if (!isObjectId(id)) return badRequest('Invalid bill id');
      const bill = await prisma.purchaseBill.findFirst({ where: { AND: [{ id }, OCR_BILL_WHERE] }, select: { id: true } });
      if (!bill) return badRequest('Bill not found', 404);
      await prisma.purchaseBillItem.deleteMany({ where: { billId: id } });
      await prisma.purchaseBill.delete({ where: { id } });
      return NextResponse.json({
        success: true,
        message: `Deleted purchase bill ${id}`
      });
    }

    return badRequest('id or resetAll parameter required');
  } catch (err: any) {
    console.error('❌ [PURCHASE BILL DELETE ERROR]', err);
    return NextResponse.json({ error: 'Failed to delete bill: ' + err.message }, { status: 500 });
  }
}
