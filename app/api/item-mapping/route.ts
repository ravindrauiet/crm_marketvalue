import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const chain = req.nextUrl.searchParams.get('chain');
    const brand = req.nextUrl.searchParams.get('brand');
    const search = req.nextUrl.searchParams.get('search');
    const mappings = await prisma.itemMapping.findMany({
      where: {
        ...(chain ? { chainName: chain } : {}),
        ...(brand ? { brandName: { contains: brand, mode: 'insensitive' } } : {}),
        ...(search ? {
          OR: [
            { chainItemName: { contains: search, mode: 'insensitive' } },
            { chainItemCode: { contains: search, mode: 'insensitive' } },
            { tallyItemName: { contains: search, mode: 'insensitive' } },
            { brandName: { contains: search, mode: 'insensitive' } },
          ]
        } : {}),
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(mappings);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chainName, chainItemCode, chainItemName, tallyItemName, tallyItemSku, brandName, companyItemCode, companyItemName, pcsPerCase, notes } = body;
    if (!chainName || !chainItemCode || !chainItemName || !tallyItemName) {
      return NextResponse.json({ error: 'chainName, chainItemCode, chainItemName, tallyItemName are required' }, { status: 400 });
    }
    const mapping = await prisma.itemMapping.create({
      data: {
        chainName: chainName.toUpperCase(),
        chainItemCode,
        chainItemName,
        tallyItemName,
        tallyItemSku: tallyItemSku || null,
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
