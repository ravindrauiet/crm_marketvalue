import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadToImageKit } from '@/lib/imagekit';

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status');
    const bills = await prisma.purchaseBill.findMany({
      where: status ? { status } : {},
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
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const base64Data = buffer.toString('base64');
    const dataUri = `data:${file.type || 'application/octet-stream'};base64,${base64Data}`;

    // Upload to ImageKit.io
    const ikRes = await uploadToImageKit(buffer, file.name, '/purchase-bills');

    const bill = await prisma.purchaseBill.create({
      data: {
        status: 'PENDING',
        filePath: dataUri,
        fileName: file.name,
        mimeType: file.type,
        imagekitUrl: ikRes?.url || null,
      }
    });

    // Trigger extraction async
    try {
      const baseUrl = req.nextUrl.origin;
      fetch(`${baseUrl}/api/purchase-bills/${bill.id}/extract`, { method: 'POST' }).catch(() => {});
    } catch {}

    return NextResponse.json(bill, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to upload bill' }, { status: 500 });
  }
}

// DELETE /api/purchase-bills - Clear all purchase bills or delete specific bill
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const resetAll = searchParams.get('resetAll');

    if (resetAll === 'true') {
      const [itemsRes, billRes] = await Promise.all([
        prisma.purchaseBillItem.deleteMany({}),
        prisma.purchaseBill.deleteMany({})
      ]);
      return NextResponse.json({
        success: true,
        message: `Cleared ${billRes.count} purchase bills and ${itemsRes.count} line items`
      });
    }

    if (id) {
      const [itemsRes, billRes] = await Promise.all([
        prisma.purchaseBillItem.deleteMany({ where: { billId: id } }),
        prisma.purchaseBill.delete({ where: { id } })
      ]);
      return NextResponse.json({
        success: true,
        message: `Deleted purchase bill ${id}`
      });
    }

    return NextResponse.json({ error: 'id or resetAll parameter required' }, { status: 400 });
  } catch (err: any) {
    console.error('❌ [PURCHASE BILL DELETE ERROR]', err);
    return NextResponse.json({ error: 'Failed to delete bill: ' + err.message }, { status: 500 });
  }
}
