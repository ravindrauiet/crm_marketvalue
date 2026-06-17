import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

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

    // Check for duplicate by checking if file is a re-upload (we'll check after OCR)
    const bill = await prisma.purchaseBill.create({
      data: {
        status: 'PENDING',
        filePath: dataUri,
        fileName: file.name,
        mimeType: file.type,
      }
    });

    // Trigger OCR extraction async
    try {
      const baseUrl = req.nextUrl.origin;
      // Fire and forget OCR
      fetch(`${baseUrl}/api/purchase-bills/${bill.id}/extract`, { method: 'POST' }).catch(() => {});
    } catch {}

    return NextResponse.json(bill, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to upload bill' }, { status: 500 });
  }
}
