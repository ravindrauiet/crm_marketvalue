import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/shortfall
// Body: { poIds: string[] }
// Returns: shortfall list per item with current stock
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

    // Aggregate required quantities by tallyItemName
    const requiredMap: Record<string, {
      tallyItemName: string;
      totalPcs: number;
      totalCases: number;
      sources: string[];
    }> = {};

    for (const po of pos) {
      for (const item of po.items) {
        const key = item.tallyItemName || item.chainItemName;
        if (!requiredMap[key]) {
          requiredMap[key] = { tallyItemName: key, totalPcs: 0, totalCases: 0, sources: [] };
        }
        requiredMap[key].totalPcs += item.quantityPcs;
        requiredMap[key].totalCases += item.quantityCase;
        requiredMap[key].sources.push(po.poNumber);
      }
    }

    // Fetch current stock for matching products
    const tallySkus = Object.keys(requiredMap);
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { in: tallySkus } },
          { sku: { in: tallySkus } },
        ]
      },
      include: { stocks: true }
    });

    const stockMap: Record<string, number> = {};
    for (const p of products) {
      const totalStock = p.stocks.reduce((sum, s) => sum + s.quantity, 0);
      stockMap[p.name] = totalStock;
      if (p.sku) stockMap[p.sku] = totalStock;
    }

    // Calculate shortfall
    const shortfallItems = Object.values(requiredMap).map(item => {
      const availableStock = stockMap[item.tallyItemName] || 0;
      const shortfallPcs = Math.max(0, item.totalPcs - availableStock);
      // Get pcsPerCase from mapping
      return {
        ...item,
        availableStock,
        shortfallPcs,
        shortfallCases: item.totalCases > 0
          ? Math.max(0, item.totalCases - (availableStock / (item.totalPcs / (item.totalCases || 1))))
          : 0,
        sources: [...new Set(item.sources)],
      };
    });

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
