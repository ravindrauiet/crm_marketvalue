import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

function cleanVal(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return NextResponse.json({ error: 'Excel/CSV file appears to be empty' }, { status: 400 });
    }

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    if (!rawData || rawData.length === 0) {
      return NextResponse.json({ error: 'Excel/CSV sheet contains no data' }, { status: 400 });
    }

    // 1. Detect header row index flexibly
    let headerRowIdx = -1;
    let colMap: Record<string, number> = {};

    const kwScore = (str: string) => {
      const s = str.toLowerCase();
      let score = 0;
      if (/sku|code|asin|fsn|ean|article|material|barcode|item\s*code|product\s*code/i.test(s)) score += 3;
      if (/desc|title|name|item|product|material\s*desc/i.test(s)) score += 3;
      if (/qty|quantity|closing|stock|units|pcs|available/i.test(s)) score += 3;
      if (/brand/i.test(s)) score += 2;
      if (/group|category|catg|grp/i.test(s)) score += 2;
      return score;
    };

    let maxScore = 0;
    for (let i = 0; i < Math.min(rawData.length, 25); i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) continue;

      let totalScore = 0;
      row.forEach(cell => {
        if (cell) totalScore += kwScore(String(cell));
      });

      if (totalScore >= 4 && totalScore > maxScore) {
        maxScore = totalScore;
        headerRowIdx = i;
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = rawData.findIndex(r => r && Array.isArray(r) && r.length > 1) || 0;
    }

    const headerRow = rawData[headerRowIdx] || [];
    headerRow.forEach((cell: any, idx: number) => {
      if (cell !== null && cell !== undefined) {
        const key = String(cell).trim().toLowerCase();
        if (key) colMap[key] = idx;
      }
    });

    const getIdx = (...terms: string[]) => {
      for (const term of terms) {
        const exact = Object.keys(colMap).find(k => k === term.toLowerCase());
        if (exact !== undefined) return colMap[exact];
      }
      for (const term of terms) {
        const partial = Object.keys(colMap).find(k => k.includes(term.toLowerCase()));
        if (partial !== undefined) return colMap[partial];
      }
      return -1;
    };

    const skuIdx = getIdx('sku / code', 'sku', 'code', 'barcode', 'ean', 'item code', 'product code', 'material');
    const nameIdx = getIdx('product name', 'item description', 'description', 'title', 'name', 'item');
    const brandIdx = getIdx('brand');
    const groupIdx = getIdx('group', 'category', 'catg');
    const qtyIdx = getIdx('closing quantity (pcs)', 'quantity (pcs)', 'stock quantity', 'closing stock', 'quantity', 'qty', 'pcs', 'stock', 'available');

    let upserted = 0;

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      const rawSku = skuIdx >= 0 ? cleanVal(row[skuIdx]) : '';
      const rawName = nameIdx >= 0 ? cleanVal(row[nameIdx]) : '';
      const rawBrand = brandIdx >= 0 ? cleanVal(row[brandIdx]) : '';
      const rawGroup = groupIdx >= 0 ? cleanVal(row[groupIdx]) : '';
      const rawQty = qtyIdx >= 0 ? cleanVal(row[qtyIdx]) : '0';

      const sku = rawSku || rawName;
      const name = rawName || rawSku;
      if (!sku && !name) continue;

      const quantity = parseFloat(rawQty.replace(/[^0-9.]/g, '')) || 0;
      const brand = rawBrand || null;
      const group = rawGroup || null;

      const product = await prisma.product.upsert({
        where: { sku: sku.toUpperCase() },
        update: { name, ...(brand ? { brand } : {}), ...(group ? { group } : {}) },
        create: { sku: sku.toUpperCase(), name, brand, group }
      });

      const existing = await prisma.stock.findFirst({ where: { productId: product.id, location: 'TOTAL' } });
      if (existing) {
        await prisma.stock.update({ where: { id: existing.id }, data: { quantity } });
      } else {
        await prisma.stock.create({
          data: {
            productId: product.id,
            location: 'TOTAL',
            quantity,
            minStock: product.minStockThreshold || 0
          }
        });
      }
      upserted++;
    }

    return NextResponse.json({ ok: true, upserted });
  } catch (err: any) {
    console.error('❌ [STOCK IMPORT ERROR]', err);
    return NextResponse.json({ error: 'Failed to import stock: ' + (err.message || err) }, { status: 500 });
  }
}

// GET /api/import/stock - Fetch all imported stock items with product info
export async function GET() {
  try {
    const stocks = await prisma.stock.findMany({
      include: {
        product: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    const items = stocks.map(s => ({
      id: s.id,
      productId: s.productId,
      sku: s.product.sku,
      name: s.product.name,
      brand: s.product.brand || '—',
      group: s.product.group || '—',
      quantity: s.quantity,
      updatedAt: s.updatedAt,
    }));

    const totalPcs = items.reduce((acc, curr) => acc + curr.quantity, 0);

    return NextResponse.json({
      success: true,
      totalItems: items.length,
      totalPcs,
      items
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch stock data: ' + err.message }, { status: 500 });
  }
}

// DELETE /api/import/stock - Delete stock entries completely
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const resetAll = searchParams.get('resetAll');

    if (resetAll === 'true') {
      const result = await prisma.stock.deleteMany({});
      return NextResponse.json({ success: true, message: `Deleted ${result.count} stock items completely` });
    }

    if (!id) {
      return NextResponse.json({ error: 'Stock ID or resetAll parameter required' }, { status: 400 });
    }

    const deleted = await prisma.stock.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'Stock item deleted completely', deleted });
  } catch (err: any) {
    console.error('❌ [STOCK DELETE ERROR]', err);
    return NextResponse.json({ error: 'Failed to delete stock item: ' + err.message }, { status: 500 });
  }
}
