import pdf from 'pdf-parse';
import fs from 'fs';

async function run() {
  const filePath = './public/uploads/1784996772618_bfc29e5f-87a3-4f2d-8ad4-d6d3a17b9f88.pdf';
  const data = await pdf(fs.readFileSync(filePath));
  const text = data.text;

  // Pattern: ASIN followed by EAN split across lines
  const regex = /(B[0-9A-Z]{9})\s*EAN:\s*(\d{7,10})\s*(\d{3,6})/g;
  const matches = [...text.matchAll(regex)];

  console.log(`\n=== EXTRACTED EANS (Total: ${matches.length}) ===`);
  const eanMap: Record<string, string> = {};
  matches.forEach((m, i) => {
    const asin = m[1];
    const ean = m[2] + m[3];
    eanMap[asin] = ean;
    console.log(`${i + 1}. ASIN: ${asin} -> EAN: ${ean}`);
  });

  console.log('\nTotal unique ASIN-EAN pairs found:', Object.keys(eanMap).length);
}

run().catch(console.error);
