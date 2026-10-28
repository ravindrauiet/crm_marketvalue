import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeChain } from '@/lib/chains';
import { brandOf } from '@/lib/brands';
import { SALE_UPLOAD_WHERE } from '@/lib/billSources';

const nameKey = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Tally item names the system knows: the stock list and items billed on Tally sale invoices */
async function knownTallyNames() {
  const [products, saleItems] = await Promise.all([
    prisma.product.findMany({ select: { name: true, sku: true } }),
    prisma.purchaseBillItem.findMany({ where: { bill: SALE_UPLOAD_WHERE }, select: { itemName: true }, distinct: ['itemName'] }),
  ]);
  return {
    // Display names for the form's pick-list (stock names first, then names billed in Tally)
    names: [...new Set([...products.map(p => p.name.replace(/s+/g, ' ').trim()), ...saleItems.map(i => i.itemName.replace(/s+/g, ' ').trim())])].sort(),
    inStock: new Set(products.flatMap(p => [nameKey(p.name), nameKey(p.sku)])),
    inSales: new Set(saleItems.map(i => nameKey(i.itemName))),
  };
}

// GET /api/item-mapping?chain=&brand=&search=
export async function GET(req: NextRequest) {
  try {
    const chain = normalizeChain(req.nextUrl.searchParams.get('chain'));
    const brand = (req.nextUrl.searchParams.get('brand') || '').trim().toUpperCase();
    const search = (req.nextUrl.searchParams.get('search') || '').trim().toLowerCase();

    const [all, known] = await Promise.all([
      prisma.itemMapping.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } }),
      knownTallyNames(),
    ]);

    const enriched = all.map(m => {
      const k = nameKey(m.tallyItemName);
      return {
        ...m,
        brand: brandOf(m.brandName, m.chainItemName, m.tallyItemName),
        brandInferred: !m.brandName?.trim(),
        // Where the Tally name was found; a typo here means no stock or sales ever match this item
        tallyFound: known.inStock.has(k) ? 'stock' : known.inSales.has(k) ? 'sales' : '',
      };
    });

    const mappings = enriched.filter(m =>
      (!chain || m.chainName === chain) &&
      (!brand || m.brand === brand) &&
      (!search || [m.chainItemCode, m.chainItemName, m.tallyItemName, m.tallyItemSku, m.eanCode, m.brand, m.companyItemCode, m.companyItemName]
        .some(v => (v || '').toLowerCase().includes(search)))
    );

    const chainCounts: Record<string, number> = {};
    enriched.forEach(m => { chainCounts[m.chainName] = (chainCounts[m.chainName] || 0) + 1; });
    const brands = [...new Set(enriched.map(m => m.brand).filter(Boolean))].sort();

    return NextResponse.json({ mappings, brands, chainCounts, total: enriched.length, tallyNotFound: enriched.filter(m => !m.tallyFound).length, tallyNames: known.names });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { chainName, chainItemCode, chainItemName, tallyItemName, tallyItemSku, eanCode, brandName, companyItemCode, companyItemName, pcsPerCase, notes } = body;
    const normalizedChainName = normalizeChain(chainName);
    const normalizedCode = String(chainItemCode ?? '').trim();
    if (!normalizedChainName || !normalizedCode || !String(chainItemName ?? '').trim() || !String(tallyItemName ?? '').trim()) {
      return NextResponse.json({ error: 'Chain, chain item code, chain item name and Tally item name are required' }, { status: 400 });
    }

    let pcs = 1;
    if (pcsPerCase !== undefined && pcsPerCase !== null && pcsPerCase !== '') {
      pcs = Number(pcsPerCase);
      if (!Number.isInteger(pcs) || pcs < 1) {
        return NextResponse.json({ error: 'Pcs per case must be a whole number of 1 or more' }, { status: 400 });
      }
    }

    // The unique index covers deleted (inactive) mappings too, so look them up as well
    const existing = await prisma.itemMapping.findFirst({
      where: { chainName: normalizedChainName, chainItemCode: { equals: normalizedCode, mode: 'insensitive' } }
    });
    if (existing?.isActive) {
      return NextResponse.json({ error: `A mapping for ${normalizedChainName} code "${normalizedCode}" already exists — edit that mapping instead of creating a duplicate.` }, { status: 409 });
    }

    const text = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
    const data = {
      chainName: normalizedChainName,
      chainItemCode: normalizedCode,
      chainItemName: String(chainItemName).trim(),
      tallyItemName: String(tallyItemName).trim(),
      tallyItemSku: text(tallyItemSku),
      eanCode: text(eanCode),
      brandName: text(brandName),
      companyItemCode: text(companyItemCode),
      companyItemName: text(companyItemName),
      pcsPerCase: pcs,
      notes: text(notes),
      isActive: true,
    };

    // Re-creating a previously deleted mapping reactivates it with the new details
    const mapping = existing
      ? await prisma.itemMapping.update({ where: { id: existing.id }, data })
      : await prisma.itemMapping.create({ data });
    return NextResponse.json(mapping, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
  }
}
