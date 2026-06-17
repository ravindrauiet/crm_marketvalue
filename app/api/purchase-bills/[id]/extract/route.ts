import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readFileSync } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import pdf from 'pdf-parse';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// POST /api/purchase-bills/[id]/extract
// Runs OCR on the uploaded file and saves structured data
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const bill = await prisma.purchaseBill.findUnique({ where: { id: params.id } });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    if (!bill.filePath) return NextResponse.json({ error: 'No file attached' }, { status: 400 });

    await prisma.purchaseBill.update({ where: { id: params.id }, data: { status: 'PROCESSING' } });

    // Read the file
    let documentText = '';

    try {
      let buf: Buffer;
      if (bill.filePath?.startsWith('data:')) {
        const base64Data = bill.filePath.split(',')[1];
        buf = Buffer.from(base64Data, 'base64');
      } else {
        const absolutePath = path.join(process.cwd(), 'public', bill.filePath || '');
        buf = readFileSync(absolutePath);
      }

      if (bill.mimeType?.includes('pdf')) {
        const pdfData = await pdf(buf);
        documentText = pdfData.text;
      } else if (bill.mimeType?.startsWith('image/')) {
        // Use OpenAI vision for images
        const base64Image = buf.toString('base64');
        const mimeType = bill.mimeType;

        const visionResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Image}` }
              },
              {
                type: 'text',
                text: 'Extract ALL text from this purchase bill / invoice image. Return everything you see as plain text, preserving the structure as much as possible.'
              }
            ]
          }],
          max_tokens: 4000,
        });
        documentText = visionResponse.choices[0]?.message?.content || '';
      } else {
        documentText = buf.toString('utf-8');
      }
    } catch (readErr: any) {
      await prisma.purchaseBill.update({
        where: { id: params.id },
        data: { status: 'FAILED', errorMessage: `File read error: ${readErr.message}` }
      });
      return NextResponse.json({ error: 'Could not read file' }, { status: 500 });
    }

    // Extract structured data with GPT
    const prompt = `You are an expert at reading purchase bills and invoices.
Extract the following information from this purchase bill and return as JSON:

{
  "supplierName": "supplier/vendor name",
  "invoiceNumber": "invoice or bill number",
  "invoiceDate": "date in YYYY-MM-DD format",
  "totalAmount": number,
  "taxAmount": number (total GST),
  "items": [
    {
      "itemName": "exact name from bill",
      "hsnCode": "HSN code if present",
      "quantity": number,
      "unit": "PCS/CASE/KG etc",
      "rate": number (per unit),
      "amount": number (quantity * rate),
      "taxRate": number (GST % as decimal e.g. 0.18 for 18%),
      "taxAmount": number
    }
  ]
}

Document text:
${documentText.substring(0, 8000)}

Return ONLY valid JSON, no extra text.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You extract structured data from purchase bills. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const extracted = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Check for duplicate invoice
    let isDuplicate = false;
    let duplicateOf = null;
    if (extracted.invoiceNumber) {
      const existing = await prisma.purchaseBill.findFirst({
        where: {
          invoiceNumber: extracted.invoiceNumber,
          id: { not: params.id },
          status: { not: 'FAILED' }
        }
      });
      if (existing) {
        isDuplicate = true;
        duplicateOf = extracted.invoiceNumber;
      }
    }

    // Save extracted data + create items
    const updatedBill = await prisma.purchaseBill.update({
      where: { id: params.id },
      data: {
        supplierName: extracted.supplierName || null,
        invoiceNumber: extracted.invoiceNumber || null,
        invoiceDate: extracted.invoiceDate ? new Date(extracted.invoiceDate) : null,
        totalAmount: extracted.totalAmount || 0,
        taxAmount: extracted.taxAmount || 0,
        rawExtractedData: JSON.stringify(extracted),
        status: isDuplicate ? 'DUPLICATE' : 'EXTRACTED',
        duplicateOf: duplicateOf,
        items: {
          deleteMany: {},
          create: (extracted.items || []).map((item: any) => ({
            itemName: item.itemName || '',
            hsnCode: item.hsnCode || null,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || null,
            rate: parseFloat(item.rate) || 0,
            amount: parseFloat(item.amount) || 0,
            taxRate: parseFloat(item.taxRate) || 0,
            taxAmount: parseFloat(item.taxAmount) || 0,
          }))
        }
      },
      include: { items: true }
    });

    return NextResponse.json({ success: true, bill: updatedBill });
  } catch (err: any) {
    console.error('OCR extraction error:', err);
    await prisma.purchaseBill.update({
      where: { id: params.id },
      data: { status: 'FAILED', errorMessage: err.message }
    }).catch(() => {});
    return NextResponse.json({ error: 'Extraction failed: ' + err.message }, { status: 500 });
  }
}
