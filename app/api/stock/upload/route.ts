import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import pdf from 'pdf-parse';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// POST /api/stock/upload
// Upload Closing Stock from Tally (Excel/CSV or PDF)
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || '';
    const name = file.name.toLowerCase();

    let extractedData: any[] = [];

    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      extractedData = rawRows.map(row => {
        const keys = Object.keys(row);
        const find = (patterns: string[]) => {
          for (const p of patterns) {
            const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p));
            if (k) return row[k];
          }
          return '';
        };

        return {
          tallyItemName: String(find(['itemname', 'particulars', 'product', 'name'])),
          sku: String(find(['sku', 'code', 'itemcode', 'partno'])),
          quantity: parseFloat(String(find(['closingbalance', 'qty', 'quantity', 'balance']))) || 0,
        };
      }).filter(i => i.tallyItemName);

    } else if (mimeType.includes('pdf') || name.endsWith('.pdf')) {
      const pdfData = await pdf(buffer);
      const documentText = pdfData.text;

      const prompt = `You are an expert at extracting closing stock/inventory data. 
Extract the items and their closing quantities from this text into a JSON array:
[
  {
    "tallyItemName": "exact item name",
    "sku": "sku or code if any",
    "quantity": number
  }
]
Only return a valid JSON array.
Text:
${documentText.substring(0, 8000)}`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'You extract inventory data. Return JSON array.' }, { role: 'user', content: prompt }],
        temperature: 0.1,
      });
      extractedData = JSON.parse(completion.choices[0]?.message?.content || '[]');
    } else {
      return NextResponse.json({ error: 'Unsupported file format, use Excel, CSV, or PDF' }, { status: 400 });
    }

    let updatedCount = 0;

    for (const item of extractedData) {
      if (!item.tallyItemName) continue;
      
      const sku = item.sku || item.tallyItemName.replace(/[^a-z0-9]/gi, '-').substring(0, 20).toUpperCase();

      // Ensure product exists
      let product = await prisma.product.findFirst({
        where: { name: item.tallyItemName }
      });

      if (!product) {
        product = await prisma.product.findUnique({
          where: { sku }
        });
      }

      if (!product) {
        product = await prisma.product.create({
          data: {
            name: item.tallyItemName,
            sku,
            price: 0,
          }
        });
      }

      // Upsert Stock
      const existingStock = await prisma.stock.findUnique({
        where: { productId_location: { productId: product.id, location: 'TOTAL' } }
      });

      if (existingStock) {
        await prisma.stock.update({
          where: { id: existingStock.id },
          data: { quantity: item.quantity }
        });
      } else {
        await prisma.stock.create({
          data: {
            productId: product.id,
            location: 'TOTAL',
            quantity: item.quantity
          }
        });
      }
      updatedCount++;
    }

    return NextResponse.json({ success: true, updatedCount });
  } catch (err: any) {
    console.error('Stock Upload Error:', err);
    return NextResponse.json({ error: 'Failed to upload stock: ' + err.message }, { status: 500 });
  }
}
