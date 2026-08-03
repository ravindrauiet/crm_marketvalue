import * as XLSX from 'xlsx';

function extractPoAndInvoice(text: string) {
  let poNumber = '';
  let invoiceNumber = '';

  // Extract PO Number (e.g. PO-2024-001, IRA27601427, 8Q4RMHAU, FSMWG06739499)
  const poMatch = text.match(/(?:PO|Order)\s*[:#\s-]*([A-Za-z0-9\-_]{5,25})/i);
  if (poMatch && poMatch[1] && !['NUMBER', 'DATE', 'DETAILS', 'ORDER'].includes(poMatch[1].toUpperCase())) {
    poNumber = poMatch[1];
  }

  // Extract Invoice Number (e.g. INV-1002, FK-9948, 2025/0814)
  const invMatch = text.match(/(?:INV|Invoice|Bill)\s*[:#\s-]*([A-Za-z0-9\-_]{4,25})/i);
  if (invMatch && invMatch[1] && !['NUMBER', 'DATE', 'DETAILS', 'BILL'].includes(invMatch[1].toUpperCase())) {
    invoiceNumber = invMatch[1];
  }

  return { poNumber, invoiceNumber };
}

const sampleNarrations = [
  'NEFT-BIGBASKET-IRA27601427-PAYMENT FOR PO IRA27601427',
  'Payment received against Invoice INV-2025-0892',
  'CHQ CLG - FLIPKART FSMWG06739499 INV-FK8819',
  'BY TRANSFER - AMAZON PO 8Q4RMHAU SETTLEMENT',
];

console.log('Testing extraction from statement narrations:');
sampleNarrations.forEach(n => {
  console.log(`\nNarration: "${n}"`);
  console.log('Extracted:', JSON.stringify(extractPoAndInvoice(n)));
});
