import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const monthParam = searchParams.get('month'); // e.g. 'MAR 2026', 'APR 2026', or 'MAR'
    const chainParam = searchParams.get('chain'); // e.g. 'RELIANCE', 'SWIGGY', 'ALL'
    const brandParam = searchParams.get('brand'); // e.g. 'HEALTHY HUNGER', 'EASTERN', 'ALL'
    const statusParam = searchParams.get('status'); // e.g. 'DELIVERED', 'CLOSED', 'OPEN', 'ALL'
    const searchParam = searchParams.get('search');

    // Default Date Range: Past 1 year from today
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const startDate = startDateParam ? new Date(startDateParam) : oneYearAgo;
    const endDate = endDateParam ? new Date(endDateParam) : new Date(now.getFullYear() + 1, 11, 31);

    // 1. Fetch ItemMappings to map Brand names
    const itemMappings = await prisma.itemMapping.findMany({
      where: { isActive: true }
    });

    const mappingMap = new Map<string, any>();
    itemMappings.forEach(m => {
      if (m.chainItemCode) mappingMap.set(`${m.chainName.toUpperCase()}::${m.chainItemCode.toLowerCase()}`, m);
      if (m.eanCode) mappingMap.set(`EAN::${m.eanCode.toLowerCase()}`, m);
    });

    // Helper to extract brand name
    const getBrandName = (chainName: string, itemCode: string, itemName: string, eanCode?: string | null): string => {
      const codeKey = `${chainName.toUpperCase()}::${(itemCode || '').toLowerCase()}`;
      const eanKey = eanCode ? `EAN::${eanCode.toLowerCase()}` : '';
      const mapItem = mappingMap.get(codeKey) || (eanKey ? mappingMap.get(eanKey) : null);
      if (mapItem?.brandName) return mapItem.brandName.toUpperCase();

      const combinedText = `${itemName || ''} ${itemCode || ''}`.toUpperCase();
      if (combinedText.includes('HEALTHY HUNGER') || combinedText.includes('HUNGER JAGGERY') || combinedText.includes('JAGGRY')) return 'HEALTHY HUNGER';
      if (combinedText.includes('MARVEL')) return 'MARVEL';
      if (combinedText.includes('EASTERN')) return 'EASTERN';
      if (combinedText.includes('MOTHER')) return "MOTHER'S RECIPE";
      if (combinedText.includes('DILBAHAR')) return 'DILBAHAR';
      if (combinedText.includes('CAMPAIGN')) return 'CAMPAIGN';

      return mapItem?.brandName || 'GENERAL';
    };

    // 2. Fetch Chain POs, Purchase Bills, Invoices, Payment Recos in parallel
    const [pos, purchaseBills, invoices, paymentRecos] = await Promise.all([
      prisma.chainPurchaseOrder.findMany({
        where: {
          poDate: { gte: startDate, lte: endDate },
          ...(chainParam && chainParam !== 'ALL' ? { chainName: { equals: chainParam.toUpperCase(), mode: 'insensitive' } } : {}),
        },
        include: { items: true },
        orderBy: { poDate: 'desc' }
      }),
      prisma.purchaseBill.findMany({
        include: { items: true }
      }),
      prisma.invoice.findMany({
        include: { items: true }
      }),
      prisma.paymentReco.findMany({})
    ]);

    // Format Month String e.g. "MAR 2026" or "MAR"
    const getMonthStr = (dateVal?: Date | null): string => {
      if (!dateVal) return 'MAR';
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return months[dateVal.getMonth()];
    };

    const getFullMonthYear = (dateVal?: Date | null): string => {
      if (!dateVal) return 'MAR 2026';
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return `${months[dateVal.getMonth()]} ${dateVal.getFullYear()}`;
    };

    // Parse DC / Location Name from rawDocumentInfo or notes
    const getDcLocation = (po: any): string => {
      try {
        if (po.rawDocumentInfo) {
          const raw = typeof po.rawDocumentInfo === 'string' ? JSON.parse(po.rawDocumentInfo) : po.rawDocumentInfo;
          if (raw.shippingAddress) {
            const firstLine = String(raw.shippingAddress).split('\n')[0].split(',')[0].trim();
            if (firstLine.length > 2) return firstLine;
          }
        }
      } catch {}
      if (po.notes && po.notes.includes('Location:')) {
        return po.notes.split('Location:')[1].split('|')[0].trim();
      }
      return po.chainName === 'RELIANCE' ? 'DADRI (SAAH)' : (po.chainName === 'SWIGGY' ? 'DLHY GGNFC5' : (po.chainName === 'ZEPTO' ? 'FBD-DRY-MH' : 'MAIN DC'));
    };

    // Build Reconciled PO List
    let reportRows = pos.map(po => {
      const poNumLower = (po.poNumber || '').toLowerCase().trim();
      const chainNameUpper = po.chainName.toUpperCase();
      const dcLocation = getDcLocation(po);
      const poExpMonth = getMonthStr(po.deliveryDate || po.appointmentDate || po.poDate);
      const fullMonthYear = getFullMonthYear(po.poDate);

      // Match with actual GLOMIN Billed Invoices / Bills
      const matchingBills = purchaseBills.filter(b => {
        const bText = (JSON.stringify(b) + ' ' + (b.notes || '') + ' ' + (b.rawExtractedData || '')).toLowerCase();
        return poNumLower && poNumLower.length >= 4 && bText.includes(poNumLower);
      });

      const matchingInvoices = invoices.filter(inv => {
        const invText = (JSON.stringify(inv)).toLowerCase();
        return poNumLower && poNumLower.length >= 4 && invText.includes(poNumLower);
      });

      const matchingRecos = paymentRecos.filter(r => {
        const rPo = (r.matchedPoNumber || '').toLowerCase();
        const rNarr = (r.narration || '').toLowerCase();
        return (poNumLower && rPo === poNumLower) || (poNumLower && poNumLower.length >= 4 && rNarr.includes(poNumLower));
      });

      // Billed Invoices String
      const invNumbersSet = new Set<string>();
      matchingBills.forEach(b => { if (b.invoiceNumber) invNumbersSet.add(b.invoiceNumber); });
      matchingInvoices.forEach(i => { if (i.invoiceNumber) invNumbersSet.add(i.invoiceNumber); });
      matchingRecos.forEach(r => { if (r.matchedInvoiceNo) invNumbersSet.add(r.matchedInvoiceNo); });

      const invoiceNoStr = Array.from(invNumbersSet).join(', ') || (po.notes?.includes('GO/') ? po.notes.split('GO/')[1].split(' ')[0] : '—');

      // Calculate Billed Items & Amounts
      let billedValue = 0;
      let deliveredQty = 0;

      // Sum billed value from matched records
      if (matchingBills.length > 0) {
        billedValue += matchingBills.reduce((s, b) => s + b.totalAmount, 0);
        deliveredQty += matchingBills.reduce((s, b) => s + (b.items ? b.items.reduce((is, item) => is + (item.quantity || 0), 0) : 0), 0);
      } else if (matchingInvoices.length > 0) {
        billedValue += matchingInvoices.reduce((s, i) => s + i.totalAmount, 0);
        deliveredQty += matchingInvoices.reduce((s, i) => s + (i.items ? i.items.reduce((is, item) => is + (item.quantity || 0), 0) : 0), 0);
      } else if (matchingRecos.length > 0) {
        billedValue += matchingRecos.reduce((s, r) => s + (r.matchedAmount || r.creditAmount || 0), 0);
      }

      // If status is COMPLETED or DELIVERED and no bill uploaded yet, assume filled based on status
      const isDeliveredStatus = po.status === 'COMPLETED' || po.status === 'DELIVERED' || po.status === 'Y - PO Delivered';
      const isClosedStatus = po.status === 'CLOSED' || po.status === 'PO CLOSED' || po.status === 'CANCELLED';

      const poValue = po.totalAmount || po.items.reduce((s, i) => s + i.totalPrice, 0);
      const poQty = po.items.reduce((s, i) => s + i.quantityPcs, 0);

      if (billedValue === 0 && isDeliveredStatus) {
        billedValue = poValue;
        deliveredQty = poQty;
      }

      // PO Status Label
      let displayStatus = 'Open / Pending';
      if (isClosedStatus || (deliveredQty === 0 && !isDeliveredStatus && poValue > 0)) {
        displayStatus = 'PO Closed';
      } else if (isDeliveredStatus || (billedValue >= poValue * 0.9 && poValue > 0)) {
        displayStatus = 'Y - PO Delivered';
      } else if (billedValue > 0) {
        displayStatus = 'Partially Billed';
      }

      // Item Level Sub-Tab Breakdown
      const itemDetails = po.items.map(item => {
        const itemBrand = getBrandName(chainNameUpper, item.chainItemCode, item.chainItemName, item.eanCode);
        
        // Find matching billed item
        let itemDeliveredQty = 0;
        let itemBilledRate = item.unitPrice;

        if (matchingBills.length > 0) {
          matchingBills.forEach(b => {
            b.items?.forEach(bi => {
              if (bi.itemName.toLowerCase().includes(item.chainItemName.toLowerCase()) || bi.itemName.toLowerCase().includes((item.chainItemCode || 'xyz').toLowerCase())) {
                itemDeliveredQty += bi.quantity || 0;
                if (bi.rate) itemBilledRate = bi.rate;
              }
            });
          });
        }

        if (itemDeliveredQty === 0 && isDeliveredStatus) {
          itemDeliveredQty = item.quantityPcs;
        }

        const shortageQty = Math.max(0, item.quantityPcs - itemDeliveredQty);
        const itemFillRatePct = item.quantityPcs > 0 ? Math.min(100, Math.round((itemDeliveredQty / item.quantityPcs) * 100)) : 0;
        
        let itemRemark = 'Full Delivered';
        if (itemDeliveredQty === 0) {
          itemRemark = `ITEM NOT BILLED BY DEPO (${item.chainItemName})`;
        } else if (shortageQty > 0) {
          itemRemark = `${item.chainItemName} Short by ${shortageQty} PCS`;
        }

        return {
          id: item.id,
          chainItemCode: item.chainItemCode,
          chainItemName: item.chainItemName,
          tallyItemName: item.tallyItemName || '',
          brandName: itemBrand,
          eanCode: item.eanCode || '',
          poQtyPcs: item.quantityPcs,
          deliveredQtyPcs: itemDeliveredQty,
          shortageQtyPcs: shortageQty,
          unitPrice: item.unitPrice,
          poTotalPrice: item.totalPrice,
          billedTotalPrice: itemDeliveredQty * itemBilledRate,
          itemFillRatePct,
          itemRemark
        };
      });

      // Dominant Brand for PO
      const brandCounts: Record<string, number> = {};
      itemDetails.forEach(i => {
        brandCounts[i.brandName] = (brandCounts[i.brandName] || 0) + 1;
      });
      const primaryBrand = Object.keys(brandCounts).sort((a, b) => brandCounts[b] - brandCounts[a])[0] || 'GENERAL';

      // Value & Qty Fill Rate Percentages
      const fillRateValuePct = poValue > 0 ? Math.min(100, parseFloat(((billedValue / poValue) * 100).toFixed(2))) : 0;
      const fillRateQtyPct = poQty > 0 ? Math.min(100, parseFloat(((deliveredQty / poQty) * 100).toFixed(2))) : 0;

      // Auto-Generate Remarks
      let remarks = 'Full Delivered';
      const shortItems = itemDetails.filter(i => i.shortageQtyPcs > 0 || i.deliveredQtyPcs === 0);
      if (displayStatus === 'PO Closed' && deliveredQty === 0) {
        remarks = 'ITEM NOT BILLED BY DEPO';
      } else if (shortItems.length > 0) {
        remarks = shortItems.map(i => `${i.chainItemName} ${i.shortageQtyPcs > 0 ? i.shortageQtyPcs + 'PCS Short' : '0PCS'}`).join(', ');
      }

      return {
        id: po.id,
        accountName: chainNameUpper,
        brand: primaryBrand,
        allBrands: Object.keys(brandCounts),
        poNumber: po.poNumber,
        dcLocation,
        poDate: po.poDate ? po.poDate.toISOString().split('T')[0] : '',
        poExpDate: po.deliveryDate ? po.deliveryDate.toISOString().split('T')[0] : (po.appointmentDate ? po.appointmentDate.toISOString().split('T')[0] : ''),
        poExpMonth,
        fullMonthYear,
        poStatus: displayStatus,
        location: dcLocation,
        poValueInRs: poValue,
        deliveryValueInRs: billedValue,
        poQtyPcs: poQty,
        deliveredQtyPcs: deliveredQty,
        invoiceNo: invoiceNoStr,
        invoiceDate: matchingBills[0]?.invoiceDate ? matchingBills[0].invoiceDate.toISOString().split('T')[0] : (po.poDate ? po.poDate.toISOString().split('T')[0] : ''),
        fillRateValuePct,
        fillRateQtyPct,
        fillRatePct: fillRateValuePct,
        remarks,
        itemDetails
      };
    });

    // 3. Apply Brand Filter
    if (brandParam && brandParam !== 'ALL') {
      const bSearch = brandParam.toUpperCase().trim();
      reportRows = reportRows.filter(r => r.allBrands.some(b => b.includes(bSearch)) || r.brand.includes(bSearch));
    }

    // 4. Apply Month Filter
    if (monthParam && monthParam !== 'ALL') {
      const mSearch = monthParam.toUpperCase().trim();
      reportRows = reportRows.filter(r => r.poExpMonth === mSearch || r.fullMonthYear.toUpperCase().includes(mSearch));
    }

    // 5. Apply Status Filter
    if (statusParam && statusParam !== 'ALL') {
      const sSearch = statusParam.toUpperCase().trim();
      reportRows = reportRows.filter(r => r.poStatus.toUpperCase().includes(sSearch));
    }

    // 6. Apply Text Search
    if (searchParam) {
      const q = searchParam.toLowerCase().trim();
      reportRows = reportRows.filter(r =>
        r.poNumber.toLowerCase().includes(q) ||
        r.accountName.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q) ||
        r.invoiceNo.toLowerCase().includes(q) ||
        r.dcLocation.toLowerCase().includes(q) ||
        r.remarks.toLowerCase().includes(q)
      );
    }

    // Calculate Global KPI Aggregates
    const summary = {
      totalPOs: reportRows.length,
      deliveredPOs: reportRows.filter(r => r.poStatus.includes('Delivered')).length,
      closedPOs: reportRows.filter(r => r.poStatus.includes('Closed')).length,
      openPOs: reportRows.filter(r => r.poStatus.includes('Open')).length,
      totalPOValue: reportRows.reduce((s, r) => s + r.poValueInRs, 0),
      totalBilledValue: reportRows.reduce((s, r) => s + r.deliveryValueInRs, 0),
      totalPOQty: reportRows.reduce((s, r) => s + r.poQtyPcs, 0),
      totalDeliveredQty: reportRows.reduce((s, r) => s + r.deliveredQtyPcs, 0),
      overallValueFillRatePct: 0,
      overallQtyFillRatePct: 0,
    };

    summary.overallValueFillRatePct = summary.totalPOValue > 0 ? parseFloat(((summary.totalBilledValue / summary.totalPOValue) * 100).toFixed(2)) : 0;
    summary.overallQtyFillRatePct = summary.totalPOQty > 0 ? parseFloat(((summary.totalDeliveredQty / summary.totalPOQty) * 100).toFixed(2)) : 0;

    // List of unique brands & chains for dropdown filters
    const availableBrands = Array.from(new Set(reportRows.map(r => r.brand)));
    const availableChains = Array.from(new Set(reportRows.map(r => r.accountName)));
    const availableMonths = Array.from(new Set(reportRows.map(r => r.fullMonthYear)));

    return NextResponse.json({
      success: true,
      summary,
      rows: reportRows,
      availableBrands,
      availableChains,
      availableMonths
    });

  } catch (err: any) {
    console.error('❌ [PO RECO REPORT API ERROR]', err);
    return NextResponse.json({ error: 'Failed to generate PO Reconciliation Report: ' + err.message }, { status: 500 });
  }
}
