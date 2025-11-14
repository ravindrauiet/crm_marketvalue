import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

type Row = Record<string, any>;

function normalizeHeader(h: string) {
  const s = h.toLowerCase().trim();
  if (/^sku|code|item ?code|product ?code/.test(s)) return 'sku';
  if (/^name|item ?name|product ?name|description/.test(s)) return 'name';
  if (/^brand/.test(s)) return 'brand';
  if (/^group|category|catg|grp/.test(s)) return 'group';
  if (/^qty|quantity|stock|closing/.test(s)) return 'quantity';
  return s;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '' });

  let upserted = 0;
  for (const row of rows) {
    const entries = Object.entries(row);
    if (entries.length === 0) continue;
    const mapped: any = {};
    for (const [k, v] of entries) mapped[normalizeHeader(String(k))] = v;
    const sku = String(mapped.sku || '').trim();
    const name = String(mapped.name || '').trim();
    if (!sku || !name) continue;
    const brand = mapped.brand ? String(mapped.brand).trim() : null;
    const group = mapped.group ? String(mapped.group).trim() : null;
    const quantity = Number(mapped.quantity ?? 0) || 0;

    const product = await prisma.product.upsert({
      where: { sku },
      update: { name, brand, group },
      create: { sku, name, brand, group }
    });

    // single total stock row; store in a synthesized location "TOTAL"
    const existing = await prisma.stock.findFirst({ where: { productId: product.id, location: 'TOTAL' } });
    if (existing) {
      await prisma.stock.update({ where: { id: existing.id }, data: { quantity } });
    } else {
      await prisma.stock.create({ data: { productId: product.id, location: 'TOTAL', quantity } });
    }
    upserted++;
  }

  return NextResponse.json({ ok: true, upserted });
}




