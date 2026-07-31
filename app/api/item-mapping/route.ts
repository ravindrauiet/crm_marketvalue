import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const chain = req.nextUrl.searchParams.get('chain');
    const brand = req.nextUrl.searchParams.get('brand');
    const search = req.nextUrl.searchParams.get('search');

    let brandFilter: any = null;
    if (brand && brand.trim()) {
      const cleanBrand = brand.trim();
      const searchTerms = Array.from(new Set([
        cleanBrand,
        cleanBrand.replace(/['’]/g, ''),
        cleanBrand.replace(/recipe/i, 'receipe')
      ]));

      brandFilter = {
        OR: searchTerms.flatMap(term => [
          { brandName: { contains: term, mode: 'insensitive' } },
          { chainItemName: { contains: term, mode: 'insensitive' } },
          { tallyItemName: { contains: term, mode: 'insensitive' } },
          { companyItemName: { contains: term, mode: 'insensitive' } },
        ])
      };
    }

    const whereClause: any = {
      isActive: true,
      ...(chain ? { chainName: chain } : {}),
      ...(search ? {
        OR: [
          { chainItemName: { contains: search, mode: 'insensitive' } },
          { chainItemCode: { contains: search, mode: 'insensitive' } },
          { tallyItemName: { contains: search, mode: 'insensitive' } },
          { brandName: { contains: search, mode: 'insensitive' } },
          { eanCode: { contains: search, mode: 'insensitive' } },
        ]
      } : {}),
    };

    if (brandFilter) {
      whereClause.AND = [brandFilter];
    }

    const mappings = await prisma.itemMapping.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    // Extract all unique brands for the brand filter dropdown
    const allActive = await prisma.itemMapping.findMany({
      where: { isActive: true },
      select: { brandName: true, chainItemName: true, tallyItemName: true }
    });

    const brandSet = new Set<string>();
    allActive.forEach(item => {
      if (item.brandName && item.brandName.trim()) {
        let b = item.brandName.trim();
        if (b.toLowerCase().includes('mother')) b = "Mother's Recipe";
        brandSet.add(b);
      } else {
        const text = `${item.chainItemName} ${item.tallyItemName}`.toLowerCase();
        if (text.includes('mother')) brandSet.add("Mother's Recipe");
        if (text.includes('eastern')) brandSet.add("Eastern");
        if (text.includes('dilbahar')) brandSet.add("Dilbahar");
      }
    });

    const brands = Array.from(brandSet).sort();

    return NextResponse.json({ mappings, brands });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chainName, chainItemCode, chainItemName, tallyItemName, tallyItemSku, eanCode, brandName, companyItemCode, companyItemName, pcsPerCase, notes } = body;
    if (!chainName || !chainItemCode || !chainItemName || !tallyItemName) {
      return NextResponse.json({ error: 'chainName, chainItemCode, chainItemName, tallyItemName are required' }, { status: 400 });
    }
    const normalizedChainName = chainName.toUpperCase();
    const normalizedCode = String(chainItemCode).trim();

    const existing = await prisma.itemMapping.findFirst({
      where: { chainName: normalizedChainName, chainItemCode: { equals: normalizedCode, mode: 'insensitive' }, isActive: true }
    });
    if (existing) {
      return NextResponse.json({ error: `A mapping for ${normalizedChainName} code "${normalizedCode}" already exists — edit that mapping instead of creating a duplicate.` }, { status: 409 });
    }

    const mapping = await prisma.itemMapping.create({
      data: {
        chainName: normalizedChainName,
        chainItemCode: normalizedCode,
        chainItemName: String(chainItemName).trim(),
        tallyItemName: String(tallyItemName).trim(),
        tallyItemSku: tallyItemSku || null,
        eanCode: eanCode ? String(eanCode).trim() : null,
        brandName: brandName || null,
        companyItemCode: companyItemCode || null,
        companyItemName: companyItemName || null,
        pcsPerCase: pcsPerCase ? parseInt(pcsPerCase) : 1,
        notes: notes || null,
      }
    });
    return NextResponse.json(mapping, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
  }
}
