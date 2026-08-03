import * as XLSX from 'xlsx';

function normalizeHeader(h: string) {
  const s = h.toLowerCase().trim();
  if (/sku|code|asin|fsn|ean|article|material|barcode|item\s*code|product\s*code/i.test(s)) return 'sku';
  if (/desc|title|name|item|product|material\s*desc/i.test(s)) return 'name';
  if (/brand/i.test(s)) return 'brand';
  if (/group|category|catg|grp/i.test(s)) return 'group';
  if (/qty|quantity|closing|stock|units|pcs|available/i.test(s)) return 'quantity';
  return s;
}

const testHeaders = [
  'SKU / CODE',
  'Product Name',
  'Brand',
  'Closing Quantity (PCS)',
  'Quantity (PCS)',
  'Stock Quantity',
  'Item Description',
  'SKU',
  'Closing Stock'
];

console.log('Testing header normalization:');
testHeaders.forEach(h => {
  console.log(`Header: "${h}" -> Mapped to: "${normalizeHeader(h)}"`);
});
