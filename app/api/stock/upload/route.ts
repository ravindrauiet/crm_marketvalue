import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import { badRequest, toNumber } from '@/lib/validation';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** SKU derived from the full item name (not truncated, so different items can't collide) */
function skuFromName(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// POST /api/stock/upload
// Upload Closing Stock from Tally (Excel/CSV or PDF)
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) return badRequest('No file uploaded');
    if (file.size === 0) return badRequest('The uploaded file is empty');
    if (file.size > MAX_FILE_BYTES) return badRequest('File is too large (max 10 MB)');

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
          tallyItemName: String(find(['itemname', 'particulars', 'product', 'name'])).trim(),
          sku: String(find(['sku', 'itemcode', 'partno', 'code'])).trim(),
          quantity: toNumber(find(['closingbalance', 'closingqty', 'qty', 'quantity', 'balance'])),
        };
      }).filter(i => i.tallyItemName && !/^(grand\s*)?total$/i.test(i.tallyItemName));

    } else if (mimeType.includes('pdf') || name.endsWith('.pdf')) {
      const pdfData = await pdf(buffer);
      const documentText = pdfData.text;

      const prompt = `You are an expert at extracting closing stock/inventory data.
Extract the items and their closing quantities from this text into JSON:
{ "items": [ { "tallyItemName": "exact item name", "sku": "sku or code if any", "quantity": number } ] }
Text:
${documentText.substring(0, 8000)}`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'You extract inventory data. Return valid JSON only.' }, { role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      extractedData = Array.isArray(parsed.items) ? parsed.items : [];
    } else {
      return badRequest('Unsupported file format, use Excel, CSV, or PDF');
    }

    // Validate rows and merge duplicates before touching the database
    const rows = new Map<string, { name: string; sku: string; quantity: number }>();
    const skipped: string[] = [];
    for (const item of extractedData) {
      const itemName = String(item.tallyItemName || '').trim();
      if (!itemName) continue;
      const qty = toNumber(item.quantity);
      if (qty === null) { skipped.push(itemName); continue; }
      const sku = (String(item.sku || '').trim() || skuFromName(itemName)).toUpperCase();
      const prev = rows.get(sku);
      if (prev) prev.quantity += Math.max(0, Math.round(qty));
      else rows.set(sku, { name: itemName, sku, quantity: Math.max(0, Math.round(qty)) });
    }

    if (rows.size === 0) {
      return badRequest('No stock rows with a valid quantity were found in the file');
    }

    let updatedCount = 0;

    for (const item of rows.values()) {
      // Match by name first, then by SKU
      let product = await prisma.product.findFirst({ where: { name: item.name } })
        || await prisma.product.findUnique({ where: { sku: item.sku } });

      if (!product) {
        product = await prisma.product.create({
          data: { name: item.name, sku: item.sku, price: 0 }
        });
      }

      const existingStock = await prisma.stock.findUnique({
        where: { productId_location: { productId: product.id, location: 'TOTAL' } }
      });
      const previousQty = existingStock?.quantity ?? 0;

      if (existingStock) {
        await prisma.stock.update({ where: { id: existingStock.id }, data: { quantity: item.quantity } });
      } else {
        await prisma.stock.create({ data: { productId: product.id, location: 'TOTAL', quantity: item.quantity } });
      }

      if (previousQty !== item.quantity) {
        await prisma.stockTransaction.create({
          data: {
            productId: product.id,
            type: item.quantity > previousQty ? 'IN' : 'OUT',
            quantity: Math.abs(item.quantity - previousQty),
            previousQty,
            newQty: item.quantity,
            reason: 'STOCK_IMPORT',
            notes: `Closing stock upload: ${file.name}`,
          }
        });
      }
      updatedCount++;
    }

    return NextResponse.json({ success: true, updatedCount, skippedRows: skipped.length, skipped: skipped.slice(0, 20) });
  } catch (err: any) {
    console.error('Stock Upload Error:', err);
    return NextResponse.json({ error: 'Failed to upload stock: ' + err.message }, { status: 500 });
  }
}
