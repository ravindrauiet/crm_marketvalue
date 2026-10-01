import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OCR_BILL_WHERE } from '@/lib/billSources';
import { ValidationError, cleanString, errorResponse, isObjectId, requireValidDate, toNumber } from '@/lib/validation';

const round2 = (n: number) => Math.round(n * 100) / 100;

// POST /api/purchase-bills/[id]/approve
// Saves verified data and generates Tally Purchase XML
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isObjectId(params.id)) throw new ValidationError('Invalid bill id');
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body');

    const bill = await prisma.purchaseBill.findUnique({
      where: { id: params.id },
      include: { items: true }
    });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    const supplierName = cleanString(body.supplierName, 200) || bill.supplierName || '';
    const invoiceNumber = cleanString(body.invoiceNumber, 100) || bill.invoiceNumber || '';
    const invoiceDate = requireValidDate(body.invoiceDate, 'Invoice date') || bill.invoiceDate;
    const notes = body.notes !== undefined ? cleanString(body.notes, 1000) : bill.notes;

    if (!supplierName) throw new ValidationError('Supplier name is required');
    if (!invoiceNumber) throw new ValidationError('Invoice number is required');
    if (!invoiceDate) throw new ValidationError('Invoice date is required');

    // Final duplicate check (OCR purchase bills only)
    const dup = await prisma.purchaseBill.findFirst({
      where: { AND: [{ invoiceNumber, id: { not: params.id }, status: { not: 'FAILED' }, isPostedToTally: true }, OCR_BILL_WHERE] }
    });
    if (dup) {
      return NextResponse.json({ error: `Invoice ${invoiceNumber} already posted to Tally` }, { status: 409 });
    }

    const sourceItems: any[] = Array.isArray(body.items) ? body.items : bill.items;
    if (sourceItems.length === 0) throw new ValidationError('At least one line item is required');

    const verifiedItems = sourceItems.map((item: any, idx: number) => {
      const line = `Line ${idx + 1}`;
      const itemName = cleanString(item.itemName || item.tallyItemName, 300);
      const quantity = toNumber(item.quantity);
      const rate = toNumber(item.rate) ?? 0;
      const taxRate = toNumber(item.taxRate) ?? 0;
      const taxAmount = toNumber(item.taxAmount) ?? 0;
      if (!itemName) throw new ValidationError(`${line}: item name is required`);
      if (quantity === null || quantity <= 0) throw new ValidationError(`${line} (${itemName}): quantity must be greater than 0`);
      if (rate < 0 || taxRate < 0 || taxAmount < 0) throw new ValidationError(`${line} (${itemName}): rate and tax cannot be negative`);
      const amount = toNumber(item.amount) || quantity * rate;
      return {
        itemName,
        tallyItemName: cleanString(item.tallyItemName, 300) || itemName,
        quantity,
        unit: cleanString(item.unit, 20) || 'PCS',
        rate: round2(rate),
        amount: round2(amount),
        taxRate,
        taxAmount: round2(taxAmount),
        hsnCode: cleanString(item.hsnCode, 20),
      };
    });

    const totalAmount = round2(verifiedItems.reduce((s, i) => s + i.amount + i.taxAmount, 0));
    const dateStr = invoiceDate.toISOString().slice(0, 10).replace(/-/g, '');

    const tallyXml = generateTallyPurchaseXml({
      invoiceNumber,
      date: dateStr,
      supplierName,
      items: verifiedItems,
    });

    // Update bill items
    await prisma.purchaseBillItem.deleteMany({ where: { billId: params.id } });
    await prisma.purchaseBillItem.createMany({
      data: verifiedItems.map(item => ({ ...item, hsnCode: item.hsnCode || null, billId: params.id }))
    });

    const updatedBill = await prisma.purchaseBill.update({
      where: { id: params.id },
      data: {
        supplierName,
        invoiceNumber,
        invoiceDate,
        totalAmount,
        taxAmount: round2(verifiedItems.reduce((s, i) => s + i.taxAmount, 0)),
        verifiedData: JSON.stringify(verifiedItems),
        tallyXmlContent: tallyXml,
        status: 'POSTED',
        isPostedToTally: true,
        notes,
      },
      include: { items: true }
    });

    return NextResponse.json({ success: true, bill: updatedBill, tallyXml });
  } catch (err: any) {
    console.error('Approve error:', err);
    return errorResponse(err, 'Failed to approve bill');
  }
}

// Tally purchase voucher. Entries balance to zero:
//   supplier (credit, +total) = Σ item amounts (debit via Purchase ledger) + GST (debit to input GST ledger)
// Company / ledger names come from env so they match the client's Tally setup.
function generateTallyPurchaseXml(data: {
  invoiceNumber: string;
  date: string;
  supplierName: string;
  items: Array<{ itemName: string; tallyItemName: string; quantity: number; unit: string; rate: number; amount: number; taxAmount: number; hsnCode: string }>;
}): string {
  const esc = (s: string) => String(s).replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c)
  );

  const company = process.env.TALLY_COMPANY_NAME || '';
  const purchaseLedger = process.env.TALLY_PURCHASE_LEDGER || 'Purchase';
  const gstLedger = process.env.TALLY_INPUT_GST_LEDGER || 'Input GST';

  const itemsTotal = round2(data.items.reduce((s, i) => s + i.amount, 0));
  const taxTotal = round2(data.items.reduce((s, i) => s + i.taxAmount, 0));
  const grandTotal = round2(itemsTotal + taxTotal);

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>${company ? `
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>` : ''}
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${esc(data.date)}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${esc(data.invoiceNumber)}</VOUCHERNUMBER>
            <REFERENCE>${esc(data.invoiceNumber)}</REFERENCE>
            <PARTYLEDGERNAME>${esc(data.supplierName)}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <ISINVOICE>Yes</ISINVOICE>

            <!-- Supplier Ledger Entry (Credit) -->
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(data.supplierName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>${grandTotal.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
${taxTotal > 0 ? `
            <!-- Input GST (Debit) -->
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(gstLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${taxTotal.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
` : ''}
            ${data.items.map(item => `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${esc(item.tallyItemName || item.itemName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${item.rate.toFixed(2)}/${esc(item.unit || 'pcs')}</RATE>
              <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
              <ACTUALQTY>${item.quantity} ${esc(item.unit || 'pcs')}</ACTUALQTY>
              <BILLEDQTY>${item.quantity} ${esc(item.unit || 'pcs')}</BILLEDQTY>
              ${item.hsnCode ? `<HSNCODE>${esc(item.hsnCode)}</HSNCODE>` : ''}
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${esc(purchaseLedger)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>`).join('')}

          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`.trim();
}
