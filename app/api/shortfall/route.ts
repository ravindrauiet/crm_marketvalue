import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/shortfall
// Body: { poIds: string[] }
// Returns: detailed shortfall list with 16 fields per item
export async function POST(req: NextRequest) {
  try {
    const { poIds } = await req.json();
    if (!Array.isArray(poIds) || poIds.length === 0) {
      return NextResponse.json({ error: 'poIds array is required' }, { status: 400 });
    }

    // Fetch all selected POs
    const pos = await prisma.chainPurchaseOrder.findMany({
      where: { id: { in: poIds } },
      include: { items: true }
    });

    // Get list of unique chain names to fetch mappings efficiently
    const chainNames = [...new Set(pos.map(po => po.chainName.toUpperCase()))];
    const mappings = await prisma.itemMapping.findMany({
      where: { chainName: { in: chainNames }, isActive: true }
    });

    // Helper to find mapping in memory
    const findMapping = (chainName: string, code: string, name: string) => {
      const c = code.trim().toLowerCase();
      const n = name.trim().toLowerCase();
      
      // Match by code first
      if (c) {
        const m = mappings.find(m => m.chainName === chainName && m.chainItemCode.toLowerCase() === c);
        if (m) return m;
      }
      // Match by name if code fails or is empty
      if (n) {
        const m = mappings.find(m => m.chainName === chainName && m.chainItemName.toLowerCase() === n);
        if (m) return m;
      }
      return null;
    };

    // Collect all unique Tally item names to query stock in one go
    const tallyNames = new Set<string>();
    for (const po of pos) {
      for (const item of po.items) {
        const mapping = findMapping(po.chainName.toUpperCase(), item.chainItemCode || '', item.chainItemName || '');
        const tallyName = mapping?.tallyItemName || item.tallyItemName || item.chainItemName;
        if (tallyName) tallyNames.add(tallyName);
      }
    }

    // Fetch stock from database
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { in: [...tallyNames] } },
          { sku: { in: [...tallyNames] } },
        ]
      },
      include: { stocks: true }
    });

    const stockMap: Record<string, number> = {};
    const locationMap: Record<string, string> = {};

    for (const p of products) {
      const totalStock = p.stocks.reduce((sum, s) => sum + s.quantity, 0);
      stockMap[p.name] = totalStock;
      if (p.sku) stockMap[p.sku] = totalStock;

      const locs = p.stocks.map(s => s.location).filter(Boolean);
      const locDisplay = locs.length > 0 ? locs.join(', ') : 'TOTAL';
      locationMap[p.name] = locDisplay;
      if (p.sku) locationMap[p.sku] = locDisplay;
    }

    // Construct shortfall item rows
    const shortfallItems = [];
    for (const po of pos) {
      for (const item of po.items) {
        const mapping = findMapping(po.chainName.toUpperCase(), item.chainItemCode || '', item.chainItemName || '');
        const tallyName = mapping?.tallyItemName || item.tallyItemName || item.chainItemName;
        const brand = mapping?.brandName || '';
        const eanCode = mapping?.eanCode || '';
        const companyItemCode = mapping?.companyItemCode || '';
        const companyItemName = mapping?.companyItemName || '';
        const pcsPerCase = mapping?.pcsPerCase || 1;

        const reqPcs = item.quantityPcs;
        const reqCase = reqPcs / pcsPerCase;

        const availableStock = stockMap[tallyName] || 0;
        const location = locationMap[tallyName] || 'TOTAL';

        const shortfallPcs = Math.max(0, reqPcs - availableStock);
        const shortfallCases = Math.max(0, reqCase - (availableStock / pcsPerCase));
        const roundedShortfallCases = Math.round(shortfallCases);

        shortfallItems.push({
          chainItemCode: item.chainItemCode,
          chainItemName: item.chainItemName,
          chainName: po.chainName,
          brandName: brand,
          tallyItemName: tallyName,
          eanCode,
          companyItemCode,
          companyItemName,
          pcsPerCase,
          reqPcs,
          reqCase,
          availableStock,
          shortfallPcs,
          shortfallCases: roundedShortfallCases, // rounded shortfall cases
          sourcePo: po.poNumber,
          appointmentDate: po.appointmentDate ? po.appointmentDate.toISOString() : null,
          location
        });
      }
    }

    return NextResponse.json({
      shortfallItems,
      poCount: pos.length,
      totalItems: shortfallItems.length,
      itemsWithShortfall: shortfallItems.filter(i => i.shortfallPcs > 0).length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to calculate shortfall' }, { status: 500 });
  }
}
