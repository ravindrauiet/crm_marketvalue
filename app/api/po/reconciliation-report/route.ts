import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SALE_UPLOAD_WHERE, poNumberFromSaleNotes } from '@/lib/billSources';
import { cleanPoNumber, dcNameFromAddress } from '@/lib/poParsers';
import { bestPoItemIndex } from '@/lib/itemMatch';

// Money convention: PO values and Tally sale amounts are both ex-GST (taxable) values.
// Fill rate follows the chains' definition: per line, delivered quantity counts up to the ordered
// quantity only (over-supply and items not on the PO do not raise it).

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_MS = 24 * 3600 * 1000;

// Stored dates are UTC midnight; read them in UTC so the calendar day never shifts
const isoDay = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const monthYear = (d?: Date | null) => (d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '');

// Whole-token match: PO 12345 must not match 123456 or AB12345
function containsToken(text: string, token: string) {
  if (!token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i').test(text);
}

/** "PO#P3960925" / "PO P3960925" -> "p3960925" */
const normPo = (s: string | null | undefined) => (s || '').replace(/^\s*po\s*[#:.-]?\s*/i, '').trim().toLowerCase();

// Brand from item wording when no item mapping names one (checked in order)
const BRAND_PATTERNS: Array<[RegExp, string]> = [
  [/HEALTHY HUNGER|HUNGER JAGGERY|JAGGRY/, 'HEALTHY HUNGER'],
  [/MOTHER'?S RECIPE|\bMOTHERS?\b/, "MOTHER'S RECIPE"],
  [/\bMTR\b/, 'MTR'],
  [/\bEASTERN\b/, 'EASTERN'],
  [/SALSALITO|TEX[\s-]?MEX/, 'SALSALITO'],
  [/MOM'?S CHOICE/, "MOM'S CHOICE"],
  [/\bMARVEL\b/, 'MARVEL'],
  [/DILBAHAR/, 'DILBAHAR'],
  [/HANDBRAND/, 'HANDBRAND'],
  [/CAMPAIGN/, 'CAMPAIGN'],
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const monthParam = searchParams.get('month'); // expiry month, e.g. 'OCT 2026'
    const chainParam = searchParams.get('chain');
    const brandParam = searchParams.get('brand');
    const statusParam = searchParams.get('status');
    const searchParam = searchParams.get('search');

    // Default: PO dates in the past year. The end date is inclusive of that whole day.
    const now = new Date();
    const startDate = startDateParam ? new Date(`${startDateParam}T00:00:00.000Z`) : new Date(now.getTime() - 365 * DAY_MS);
    const endDate = endDateParam ? new Date(`${endDateParam}T23:59:59.999Z`) : now;

    const itemMappings = await prisma.itemMapping.findMany({ where: { isActive: true } });
    const mappingMap = new Map<string, (typeof itemMappings)[number]>();
    itemMappings.forEach(m => {
      if (m.chainItemCode) mappingMap.set(`${m.chainName.toUpperCase()}::${m.chainItemCode.toLowerCase()}`, m);
      if (m.eanCode) mappingMap.set(`EAN::${m.eanCode.toLowerCase()}`, m);
    });

    const getBrandName = (chainName: string, itemCode: string, itemName: string, eanCode?: string | null): string => {
      const mapItem = mappingMap.get(`${chainName}::${(itemCode || '').toLowerCase()}`) || (eanCode ? mappingMap.get(`EAN::${eanCode.toLowerCase()}`) : undefined);
      if (mapItem?.brandName) return mapItem.brandName.toUpperCase();
      const text = `${itemName || ''} ${itemCode || ''}`.toUpperCase();
      return BRAND_PATTERNS.find(([re]) => re.test(text))?.[1] || 'GENERAL';
    };

    const [pos, saleBills, paymentRecos] = await Promise.all([
      prisma.chainPurchaseOrder.findMany({
        where: {
          poDate: { gte: startDate, lte: endDate },
          // POs deleted from the PO list are soft-deleted as REMOVED and must not be reported
          status: { not: 'REMOVED' },
          ...(chainParam && chainParam !== 'ALL' ? { chainName: { equals: chainParam.toUpperCase(), mode: 'insensitive' } } : {}),
        },
        include: { items: true },
        orderBy: { poDate: 'desc' },
      }),
      // Only daily Tally sale uploads count as deliveries (OCR purchase bills are supplier invoices)
      prisma.purchaseBill.findMany({ where: SALE_UPLOAD_WHERE, include: { items: true } }),
      prisma.paymentReco.findMany({ where: { matchStatus: { not: 'IGNORED' } } }),
    ]);

    // Sale invoices indexed by their PO number for a direct lookup
    const billsByPo = new Map<string, typeof saleBills>();
    saleBills.forEach(b => {
      const key = normPo(poNumberFromSaleNotes(b.notes));
      if (!key) return;
      billsByPo.set(key, [...(billsByPo.get(key) || []), b]);
    });

    const getDcLocation = (po: (typeof pos)[number]): string => {
      try {
        if (po.rawDocumentInfo) {
          const raw = JSON.parse(po.rawDocumentInfo);
          if (raw.dcName) return String(raw.dcName);
          // Short DC name from the ship-to address (skips company names like "… Private Limited")
          const fromAddress = dcNameFromAddress(raw.shippingAddress);
          if (fromAddress) return fromAddress;
        }
      } catch {}
      if (po.notes && po.notes.includes('Location:')) return po.notes.split('Location:')[1].split('|')[0].trim();
      return '—';
    };

    let reportRows = pos.map(po => {
      // Old uploads stored file-name style numbers ("purchase_order_FLS…"); match and show the bare PO number
      const displayPoNumber = cleanPoNumber(po.poNumber || '');
      const poKey = displayPoNumber.toLowerCase();
      const chainNameUpper = po.chainName.toUpperCase();
      const dcLocation = getDcLocation(po);
      const expiryDate = po.deliveryDate || po.appointmentDate;

      const matchingBills = (billsByPo.get(poKey) || []).slice();
      // Tally order numbers occasionally carry extra text around the PO ("PO#X / 2"): whole-token fallback
      if (!matchingBills.length && poKey.length >= 6) {
        saleBills.forEach(b => { if (containsToken(poNumberFromSaleNotes(b.notes), poKey)) matchingBills.push(b); });
      }
      matchingBills.sort((a, b) => (a.invoiceDate?.getTime() || 0) - (b.invoiceDate?.getTime() || 0));
      const invoiceNumbers = new Set(matchingBills.map(b => (b.invoiceNumber || '').toLowerCase()).filter(Boolean));

      // Payments: by the PO they were matched to, by one of this PO's invoices, or by the PO in the narration
      const matchingRecos = paymentRecos.filter(r =>
        (!!poKey && normPo(r.matchedPoNumber) === poKey) ||
        (!!r.matchedInvoiceNo && invoiceNumbers.has(r.matchedInvoiceNo.toLowerCase())) ||
        (poKey.length >= 6 && containsToken(r.narration || '', poKey))
      );

      const billedValue = matchingBills.reduce((s, b) => s + (b.totalAmount || 0), 0);
      const isMarkedDelivered = ['COMPLETED', 'DELIVERED'].includes(po.status);
      const isClosedStatus = ['CLOSED', 'PO CLOSED', 'CANCELLED'].includes(po.status);
      const poValue = po.totalAmount || po.items.reduce((s, i) => s + i.totalPrice, 0);
      const poQty = po.items.reduce((s, i) => s + i.quantityPcs, 0);

      // Assign every billed (Tally) line to the PO item it belongs to. Tally and the chain
      // name the same product differently, so match on mapped Tally name / pack size / wording / price.
      const poItemsForMatch = po.items.map(item => {
        const mapItem = mappingMap.get(`${chainNameUpper}::${(item.chainItemCode || '').toLowerCase()}`)
          || (item.eanCode ? mappingMap.get(`EAN::${item.eanCode.toLowerCase()}`) : undefined);
        return { chainItemName: item.chainItemName, tallyItemName: item.tallyItemName || mapItem?.tallyItemName || '', unitPrice: item.unitPrice };
      });
      const billedByItem = po.items.map(() => ({ qty: 0, amount: 0 }));
      const unmatchedLines = new Map<string, { qty: number; amount: number }>();
      matchingBills.forEach(b => b.items.forEach(bi => {
        const amount = bi.amount || (bi.quantity || 0) * (bi.rate || 0);
        const idx = bestPoItemIndex(poItemsForMatch, bi);
        if (idx === -1) {
          const u = unmatchedLines.get(bi.itemName) || { qty: 0, amount: 0 };
          u.qty += bi.quantity || 0;
          u.amount += amount;
          unmatchedLines.set(bi.itemName, u);
          return;
        }
        billedByItem[idx].qty += bi.quantity || 0;
        billedByItem[idx].amount += amount;
      }));
      const unmatchedBilledValue = [...unmatchedLines.values()].reduce((s, u) => s + u.amount, 0);

      const itemDetails = po.items.map((item, itemIdx) => {
        const deliveredQtyPcs = billedByItem[itemIdx].qty;
        const filledQty = Math.min(deliveredQtyPcs, item.quantityPcs);
        const shortageQty = Math.max(0, item.quantityPcs - deliveredQtyPcs);
        return {
          id: item.id,
          chainItemCode: item.chainItemCode,
          chainItemName: item.chainItemName,
          tallyItemName: poItemsForMatch[itemIdx].tallyItemName,
          brandName: getBrandName(chainNameUpper, item.chainItemCode, item.chainItemName, item.eanCode),
          eanCode: item.eanCode || '',
          poQtyPcs: item.quantityPcs,
          deliveredQtyPcs,
          filledQty,
          shortageQtyPcs: shortageQty,
          excessQtyPcs: Math.max(0, deliveredQtyPcs - item.quantityPcs),
          unitPrice: item.unitPrice,
          poTotalPrice: item.totalPrice,
          billedTotalPrice: billedByItem[itemIdx].amount,
          itemFillRatePct: item.quantityPcs > 0 ? Math.round((filledQty / item.quantityPcs) * 100) : 0,
          itemRemark: '',
        };
      });

      const deliveredQty = itemDetails.reduce((s, i) => s + i.deliveredQtyPcs, 0);
      const filledQtyTotal = itemDetails.reduce((s, i) => s + i.filledQty, 0);
      const filledValue = itemDetails.reduce((s, i) => s + i.filledQty * i.unitPrice, 0);
      const itemsValue = po.items.reduce((s, i) => s + i.totalPrice, 0);
      const fillRateQtyPct = poQty > 0 ? parseFloat(((filledQtyTotal / poQty) * 100).toFixed(2)) : 0;
      const fillRateValuePct = itemsValue > 0 ? Math.min(100, parseFloat(((filledValue / itemsValue) * 100).toFixed(2))) : 0;

      // A PO with nothing delivered is only "closed" once it has expired — expiry / appointment
      // date, or 15 days after the PO date when the PO states neither.
      const expiry = expiryDate || new Date(po.poDate.getTime() + 15 * DAY_MS);
      const isExpired = expiry.getTime() < now.getTime() - DAY_MS;
      const anyDelivered = deliveredQty > 0 || billedValue > 0;
      let displayStatus = 'Open / Pending';
      if (isClosedStatus || (!anyDelivered && !isMarkedDelivered && isExpired)) displayStatus = 'PO Closed';
      else if (isMarkedDelivered || (poQty > 0 && fillRateQtyPct >= 99.5)) displayStatus = 'Full Delivery';
      else if (anyDelivered) displayStatus = 'Part Delivery';

      itemDetails.forEach(i => {
        if (i.deliveredQtyPcs === 0) i.itemRemark = displayStatus === 'Open / Pending' ? 'Awaiting delivery' : 'Not billed';
        else if (i.shortageQtyPcs > 0) i.itemRemark = `Short by ${i.shortageQtyPcs} PCS`;
        else if (i.excessQtyPcs > 0) i.itemRemark = `Over-billed by ${i.excessQtyPcs} PCS`;
        else i.itemRemark = 'Full delivered';
      });

      const brandCounts: Record<string, number> = {};
      itemDetails.forEach(i => { brandCounts[i.brandName] = (brandCounts[i.brandName] || 0) + 1; });
      const primaryBrand = Object.keys(brandCounts).sort((a, b) => brandCounts[b] - brandCounts[a])[0] || 'GENERAL';

      const paymentInstallments = matchingRecos
        .slice()
        .sort((a, b) => (a.txnDate?.getTime() || 0) - (b.txnDate?.getTime() || 0))
        .map((r, idx) => ({
          installmentNo: idx + 1,
          paymentDate: isoDay(r.txnDate),
          bankRef: r.bankRef || r.chequeNo || '—',
          narration: r.narration || '',
          // Same convention as Payment Reconciliation: a credit line is money received
          amountPaid: r.creditAmount > 0 ? r.creditAmount : (r.matchedAmount || 0),
          tdsAmount: r.deductionAmount || 0,
          matchedInvoiceNo: r.matchedInvoiceNo || '—',
          batchId: r.batchId,
        }));

      // Only what was billed can be owed; payments include GST while billed value is ex-GST,
      // so payments + deductions covering the billed value count as fully set off.
      const totalPaymentsReceived = paymentInstallments.reduce((s, p) => s + p.amountPaid, 0);
      const totalDeductions = paymentInstallments.reduce((s, p) => s + p.tdsAmount, 0);
      const netPendingBalance = Math.max(0, billedValue - totalPaymentsReceived - totalDeductions);
      let setOffStatus: 'FULLY_SET_OFF' | 'PARTIAL_PAID' | 'UNPAID' | 'NOT_BILLED' = 'UNPAID';
      if (billedValue <= 0) setOffStatus = totalPaymentsReceived > 0 ? 'PARTIAL_PAID' : 'NOT_BILLED';
      else if (netPendingBalance < 1) setOffStatus = 'FULLY_SET_OFF';
      else if (totalPaymentsReceived > 0) setOffStatus = 'PARTIAL_PAID';

      // Auto remarks (REMARKS 1: supply, REMARKS 2: price). Manual edits saved on the report win.
      const warnings: string[] = [];
      if (!po.items.length || poQty === 0) warnings.push('PO has no item quantities — re-upload the PO file');
      if (unmatchedLines.size) warnings.push(`₹${Math.round(unmatchedBilledValue).toLocaleString('en-IN')} billed for items not on this PO`);

      let remarks1 = 'Full Supplied';
      const shortItems = itemDetails.filter(i => i.shortageQtyPcs > 0);
      if (displayStatus === 'Open / Pending' && !anyDelivered) {
        remarks1 = `Awaiting delivery (PO valid till ${isoDay(expiry)})`;
      } else if (displayStatus === 'PO Closed' && !anyDelivered) {
        remarks1 = 'ITEM NOT BILLED BY DEPO';
      } else if (isMarkedDelivered && !anyDelivered) {
        remarks1 = 'Marked delivered on the PO list — no Tally invoice uploaded';
      } else if (shortItems.length) {
        remarks1 = shortItems.map(i => `${i.chainItemName} (${i.deliveredQtyPcs > 0 ? `${i.shortageQtyPcs} Pcs Short` : '0 Pcs Billed'})`).join(', ');
      }
      const autoRemarks1 = [remarks1, ...warnings.map(w => '⚠ ' + w)].join(' · ');

      // Billed rate vs PO rate, allowing for paise rounding (₹0.50 or 0.5%)
      const priceMismatchItems = itemDetails.filter(i => {
        if (!i.deliveredQtyPcs || !i.billedTotalPrice || !i.unitPrice) return false;
        const billedRate = i.billedTotalPrice / i.deliveredQtyPcs;
        return Math.abs(billedRate - i.unitPrice) > Math.max(0.5, i.unitPrice * 0.005);
      });
      const autoRemarks2 = priceMismatchItems.length
        ? priceMismatchItems.map(i => `${i.chainItemName} (PO ₹${i.unitPrice} vs Billed ₹${(i.billedTotalPrice / i.deliveredQtyPcs).toFixed(2)})`).join(', ')
        : 'Price OK';

      return {
        id: po.id,
        accountName: chainNameUpper,
        brand: primaryBrand,
        allBrands: Object.keys(brandCounts),
        poNumber: displayPoNumber,
        dcLocation,
        poDate: isoDay(po.poDate),
        poExpDate: isoDay(expiryDate),
        poExpMonth: monthYear(expiryDate),
        fullMonthYear: monthYear(po.poDate),
        poStatus: displayStatus,
        location: dcLocation,
        poValueInRs: poValue,
        deliveryValueInRs: billedValue,
        unmatchedBilledValue,
        totalPaymentsReceived,
        netPendingBalance,
        setOffStatus,
        paymentInstallments,
        installmentCount: paymentInstallments.length,
        poQtyPcs: poQty,
        deliveredQtyPcs: deliveredQty,
        invoiceNo: matchingBills.map(b => b.invoiceNumber).filter(Boolean).join(', ') || '—',
        // First (earliest) invoice date; an undelivered PO has none
        invoiceDate: isoDay(matchingBills[0]?.invoiceDate),
        fillRateValuePct,
        fillRateQtyPct,
        fillRatePct: fillRateValuePct,
        warnings,
        remarks: autoRemarks1,
        remarks1: po.remarks1 ?? autoRemarks1,
        remarks2: po.remarks2 ?? autoRemarks2,
        remarks3: po.remarks3 ?? '',
        remarks4: po.remarks4 ?? '',
        itemDetails,
      };
    });

    // Filter choices come from the date/chain-scoped data, before the other filters narrow it
    const availableBrands = Array.from(new Set(reportRows.flatMap(r => r.allBrands))).sort();
    const availableMonths = Array.from(new Set(reportRows.map(r => r.poExpMonth).filter(Boolean)))
      .sort((a, b) => (a.slice(4) + String(MONTHS.indexOf(a.slice(0, 3))).padStart(2, '0')).localeCompare(b.slice(4) + String(MONTHS.indexOf(b.slice(0, 3))).padStart(2, '0')));
    const availableChains = Array.from(new Set(
      (await prisma.chainPurchaseOrder.findMany({ where: { status: { not: 'REMOVED' } }, select: { chainName: true }, distinct: ['chainName'] }))
        .map(p => p.chainName.toUpperCase())
    )).sort();

    if (brandParam && brandParam !== 'ALL') {
      const b = brandParam.toUpperCase().trim();
      reportRows = reportRows.filter(r => r.allBrands.includes(b));
    }
    if (monthParam && monthParam !== 'ALL') {
      const m = monthParam.toUpperCase().trim();
      reportRows = reportRows.filter(r => r.poExpMonth === m);
    }
    if (statusParam && statusParam !== 'ALL') {
      const s = statusParam.toUpperCase().trim();
      reportRows = reportRows.filter(r => r.poStatus.toUpperCase() === s);
    }
    if (searchParam) {
      const q = searchParam.toLowerCase().trim();
      reportRows = reportRows.filter(r =>
        [r.poNumber, r.accountName, r.brand, r.invoiceNo, r.dcLocation, r.remarks1, r.remarks2, r.remarks3, r.remarks4]
          .some(v => (v || '').toLowerCase().includes(q)) ||
        r.itemDetails.some(i => [i.chainItemCode, i.chainItemName, i.tallyItemName, i.eanCode].some(v => (v || '').toLowerCase().includes(q)))
      );
    }

    const sum = (f: (r: (typeof reportRows)[number]) => number) => reportRows.reduce((s, r) => s + f(r), 0);
    const totalItemsValue = sum(r => r.itemDetails.reduce((s, i) => s + i.poTotalPrice, 0));
    const totalFilledValue = sum(r => r.itemDetails.reduce((s, i) => s + i.filledQty * i.unitPrice, 0));
    const totalPOQty = sum(r => r.poQtyPcs);
    const totalFilledQty = sum(r => r.itemDetails.reduce((s, i) => s + i.filledQty, 0));
    const summary = {
      totalPOs: reportRows.length,
      deliveredPOs: reportRows.filter(r => r.poStatus === 'Full Delivery').length,
      partDeliveredPOs: reportRows.filter(r => r.poStatus === 'Part Delivery').length,
      closedPOs: reportRows.filter(r => r.poStatus === 'PO Closed').length,
      openPOs: reportRows.filter(r => r.poStatus === 'Open / Pending').length,
      totalPOValue: sum(r => r.poValueInRs),
      totalBilledValue: sum(r => r.deliveryValueInRs),
      unmatchedBilledValue: sum(r => r.unmatchedBilledValue),
      totalPOQty,
      totalDeliveredQty: sum(r => r.deliveredQtyPcs),
      overallValueFillRatePct: totalItemsValue > 0 ? parseFloat(((totalFilledValue / totalItemsValue) * 100).toFixed(2)) : 0,
      overallQtyFillRatePct: totalPOQty > 0 ? parseFloat(((totalFilledQty / totalPOQty) * 100).toFixed(2)) : 0,
      posWithWarnings: reportRows.filter(r => r.warnings.length).length,
    };

    // Upload tracker for the daily calendar (YYYY-MM-DD -> stats)
    const uploadedDatesMap: Record<string, { count: number; invoicesCount: number; totalAmount: number }> = {};
    saleBills.forEach(b => {
      if (!b.invoiceDate) return;
      const d = uploadedDatesMap[isoDay(b.invoiceDate)] ||= { count: 0, invoicesCount: 0, totalAmount: 0 };
      d.invoicesCount += 1;
      d.count += b.items.length;
      d.totalAmount += b.totalAmount || 0;
    });

    return NextResponse.json({ success: true, summary, rows: reportRows, availableBrands, availableChains, availableMonths, uploadedDatesMap });
  } catch (err: any) {
    console.error('❌ [PO RECO REPORT API ERROR]', err);
    return NextResponse.json({ error: 'Failed to generate PO Reconciliation Report: ' + err.message }, { status: 500 });
  }
}
