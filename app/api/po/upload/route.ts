import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

// POST /api/po/upload
// Upload and extract PO details from Excel/PDF/Word/Image
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const chainName = formData.get('chainName') as string || 'OTHER';

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || '';
    const name = file.name.toLowerCase();

    let extractedData: any = { poNumber: '', poDate: null, items: [] };

    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      // Parse Excel
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const items = rawRows.map(row => {
        const keys = Object.keys(row);
        const find = (patterns: string[]) => {
          for (const p of patterns) {
            const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(p));
            if (k) return row[k];
          }
          return '';
        };

        return {
          chainItemCode: String(find(['itemcode', 'articlecode', 'ean', 'sku'])),
          chainItemName: String(find(['itemname', 'description', 'article name', 'product'])),
          quantityPcs: parseFloat(String(find(['qty', 'quantity', 'pieces', 'pcs']))),
          unitPrice: parseFloat(String(find(['price', 'rate', 'unitprice']))),
        };
      }).filter(i => i.chainItemName || i.chainItemCode);

      extractedData.items = items;
      
    } else {
      // PDF, DOCX, Image -> Use GPT
      let documentText = '';
      if (mimeType.includes('pdf') || name.endsWith('.pdf')) {
        const pdfData = await pdf(buffer);
        documentText = pdfData.text;
      } else if (name.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer });
        documentText = result.value;
      } else if (mimeType.startsWith('image/')) {
        const base64Image = buffer.toString('base64');
        const visionResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
              { type: 'text', text: 'Extract ALL text from this Purchase Order image. Return plain text.' }
            ]
          }],
          max_tokens: 4000,
        });
        documentText = visionResponse.choices[0]?.message?.content || '';
      } else {
        documentText = buffer.toString('utf-8');
      }

      // Extract with GPT
      const prompt = `You are an expert at extracting Purchase Orders.
Extract the following from this text:
{
  "poNumber": "PO number string",
  "poDate": "YYYY-MM-DD or null",
  "items": [
    {
      "chainItemCode": "item code/article code/EAN",
      "chainItemName": "exact item name",
      "quantityPcs": number,
      "unitPrice": number
    }
  ]
}

Only return valid JSON. Wait to format quantities correctly as numbers. 
If prices are not mentioned, assume 0.
Text:
${documentText.substring(0, 8000)}`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'You extract PO data. Return JSON.' }, { role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });
      const gptExtracted = JSON.parse(completion.choices[0]?.message?.content || '{}');
      extractedData.poNumber = gptExtracted.poNumber || '';
      extractedData.poDate = gptExtracted.poDate || null;
      extractedData.items = gptExtracted.items || [];
    }

    // Auto-match items against ItemMapping
    const finalItems = await Promise.all((extractedData.items || []).map(async (item: any) => {
      let mapping = null;
      if (item.chainItemCode) {
        mapping = await prisma.itemMapping.findFirst({
          where: { chainItemCode: item.chainItemCode, chainName: chainName.toUpperCase() }
        });
      }
      if (!mapping && item.chainItemName) {
        // Try fuzzy name match if code fails
         mapping = await prisma.itemMapping.findFirst({
          where: { chainItemName: item.chainItemName, chainName: chainName.toUpperCase() }
        });
      }

      return {
        chainItemCode: item.chainItemCode || '',
        chainItemName: item.chainItemName || '',
        tallyItemName: mapping?.tallyItemName || '',
        quantityPcs: typeof item.quantityPcs === 'number' ? item.quantityPcs : parseFloat(item.quantityPcs || 0) || 0,
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice || 0) || 0,
        matched: !!mapping,
      };
    }));

    return NextResponse.json({
      success: true,
      poNumber: extractedData.poNumber || '',
      poDate: extractedData.poDate || '',
      items: finalItems,
    });
  } catch (err: any) {
    console.error('PO Upload Error:', err);
    return NextResponse.json({ error: 'Failed to process PO: ' + err.message }, { status: 500 });
  }
}
