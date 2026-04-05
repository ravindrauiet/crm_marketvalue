import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/purchase-bills/[id]/approve
// Saves verified data and generates Tally Purchase XML
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { supplierName, invoiceNumber, invoiceDate, items, notes } = body;

    const bill = await prisma.purchaseBill.findUnique({
      where: { id: params.id },
      include: { items: true }
    });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    // Final duplicate check
    if (invoiceNumber) {
      const dup = await prisma.purchaseBill.findFirst({
        where: { invoiceNumber, id: { not: params.id }, status: { not: 'FAILED' }, isPostedToTally: true }
      });
      if (dup) {
        return NextResponse.json({ error: `Invoice ${invoiceNumber} already posted to Tally` }, { status: 409 });
      }
    }

    const verifiedItems = (items || bill.items).map((item: any) => ({
      itemName: item.itemName || item.tallyItemName || '',
      tallyItemName: item.tallyItemName || item.itemName || '',
      quantity: parseFloat(item.quantity) || 0,
      unit: item.unit || 'PCS',
      rate: parseFloat(item.rate) || 0,
      amount: parseFloat(item.amount) || (parseFloat(item.quantity) * parseFloat(item.rate)),
      taxRate: parseFloat(item.taxRate) || 0,
      taxAmount: parseFloat(item.taxAmount) || 0,
      hsnCode: item.hsnCode || '',
    }));

    const totalAmount = verifiedItems.reduce((s: number, i: any) => s + i.amount + i.taxAmount, 0);

    // Generate Tally Purchase Voucher XML
    const dateStr = invoiceDate
      ? new Date(invoiceDate).toISOString().slice(0, 10).replace(/-/g, '')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const tallyXml = generateTallyPurchaseXml({
      invoiceNumber: invoiceNumber || bill.invoiceNumber || `BILL-${params.id.slice(-6)}`,
      date: dateStr,
      supplierName: supplierName || bill.supplierName || 'Unknown Supplier',
      totalAmount,
      items: verifiedItems,
    });

    // Update bill items
    await prisma.purchaseBillItem.deleteMany({ where: { billId: params.id } });
    await prisma.purchaseBillItem.createMany({
      data: verifiedItems.map((item: any) => ({ ...item, billId: params.id }))
    });

    const updatedBill = await prisma.purchaseBill.update({
      where: { id: params.id },
      data: {
        supplierName: supplierName || bill.supplierName,
        invoiceNumber: invoiceNumber || bill.invoiceNumber,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : bill.invoiceDate,
        totalAmount,
        verifiedData: JSON.stringify(verifiedItems),
        tallyXmlContent: tallyXml,
        status: 'POSTED',
        isPostedToTally: true,
        notes: notes || bill.notes,
      },
      include: { items: true }
    });

    return NextResponse.json({ success: true, bill: updatedBill, tallyXml });
  } catch (err: any) {
    console.error('Approve error:', err);
    return NextResponse.json({ error: 'Failed to approve bill: ' + err.message }, { status: 500 });
  }
}

function generateTallyPurchaseXml(data: {
  invoiceNumber: string;
  date: string;
  supplierName: string;
  totalAmount: number;
  items: any[];
}): string {
  const esc = (s: string) => String(s).replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c)
  );

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Your Company Name</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${esc(data.date)}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${esc(data.invoiceNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${esc(data.supplierName)}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>

            <!-- Supplier Ledger Entry (Credit) -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(data.supplierName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>${data.totalAmount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <!-- Purchase Ledger Entry (Debit) -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchase</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>No</ISPARTYLEDGER>
              <AMOUNT>-${data.totalAmount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            ${data.items.map(item => `
            <INVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${esc(item.tallyItemName || item.itemName)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISAUTONEGATIVE>No</ISAUTONEGATIVE>
              <RATE>${item.rate.toFixed(2)}/${item.unit || 'pcs'}</RATE>
              <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
              <ACTUALQTY>${item.quantity} ${item.unit || 'pcs'}</ACTUALQTY>
              <BILLEDQTY>${item.quantity} ${item.unit || 'pcs'}</BILLEDQTY>
              ${item.hsnCode ? `<HSNCODE>${esc(item.hsnCode)}</HSNCODE>` : ''}
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>Purchase</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-${item.amount.toFixed(2)}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </INVENTORYENTRIES.LIST>`).join('')}

          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`.trim();
}
