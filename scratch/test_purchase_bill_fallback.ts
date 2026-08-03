function localExtractPurchaseBill(text: string, fileName: string) {
  let supplierName = '';
  let invoiceNumber = '';
  let invoiceDate = '';
  let totalAmount = 0;
  let taxAmount = 0;

  // 1. Supplier Name
  const supplierMatch = text.match(/(?:Supplier|Vendor|Billed\s*By|From)\s*[:=\s]\s*([A-Za-z0-9\s\.\-_&,]{3,50})/i);
  if (supplierMatch && supplierMatch[1]) {
    supplierName = supplierMatch[1].split('\n')[0].trim();
  } else {
    // Try first line of text
    const firstLine = text.split('\n').map(s => s.trim()).filter(Boolean)[0];
    if (firstLine && firstLine.length < 50 && !firstLine.toLowerCase().includes('invoice') && !firstLine.toLowerCase().includes('tax')) {
      supplierName = firstLine;
    }
  }

  // 2. Invoice Number
  const invMatch = text.match(/(?:Invoice\s*(?:No|Num|#)?|Bill\s*(?:No|Num|#)?|Inv\s*No)\s*[:=\s#-]*([A-Za-z0-9\/\-_]{3,30})/i);
  if (invMatch && invMatch[1]) {
    invoiceNumber = invMatch[1].trim();
  } else {
    // Try matching pattern like K00681/26-27 or INV-1234
    const patternMatch = text.match(/([A-Z0-9]{2,8}[\/-][A-Z0-9\/-]{3,20})/);
    if (patternMatch) invoiceNumber = patternMatch[1].trim();
  }

  // 3. Invoice Date
  const dateMatch = text.match(/(?:Date|Invoice\s*Date|Bill\s*Date)\s*[:=\s]*([0-9]{1,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{1,4}|[0-9]{1,2}[\/-][A-Za-z]{3}[\/-][0-9]{2,4})/i);
  if (dateMatch && dateMatch[1]) {
    invoiceDate = dateMatch[1].trim();
  }

  // 4. Total Amount & Tax Amount
  const totalMatch = text.match(/(?:Total\s*Amount|Grand\s*Total|Net\s*Amount|Total)\s*[:=\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (totalMatch && totalMatch[1]) {
    totalAmount = parseFloat(totalMatch[1].replace(/,/g, '')) || 0;
  }

  const taxMatch = text.match(/(?:Tax\s*Amount|Total\s*GST|IGST|CGST|SGST|Tax)\s*[:=\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (taxMatch && taxMatch[1]) {
    taxAmount = parseFloat(taxMatch[1].replace(/,/g, '')) || 0;
  }

  return { supplierName, invoiceNumber, invoiceDate, totalAmount, taxAmount };
}

const sampleBillText = `
KIDYS FOOD PRODUCTS PVT LTD
H.No-12, Sector 5, Industrial Area, Sonipat
TAX INVOICE
Invoice No: K00681/26-27
Date: 12/06/2026

Items:
1. Sabudana Papad 70g - Qty: 100 - Rate: 40 - Amount: 4000
2. Potato Chips 50g - Qty: 50 - Rate: 20 - Amount: 1000

Taxable Value: 92492.38
Tax Amount: 4624.62
Total Amount: 97117.00
`;

console.log('Testing local purchase bill fallback extraction:');
console.log(JSON.stringify(localExtractPurchaseBill(sampleBillText, 'bill.pdf'), null, 2));
