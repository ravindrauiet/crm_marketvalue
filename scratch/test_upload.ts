import fs from 'fs';
import path from 'path';

// Parse .env manually BEFORE importing ai
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const val = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      process.env[key.trim()] = val;
    }
  }
}

async function run() {
  const { extractProductsWithAI } = await import('../lib/ai');
  const file = './public/uploads/1784996772618_bfc29e5f-87a3-4f2d-8ad4-d6d3a17b9f88.pdf';
  console.log('Testing AI extraction with fix...');
  const res = await extractProductsWithAI(file, 'application/pdf', 'amazon');

  console.log('\n================================');
  console.log(`TOTAL EXTRACTED PRODUCTS: ${res.products.length}`);
  res.products.forEach((p, i) => {
    console.log(`${i + 1}. SKU: "${p.sku}" | EAN: "${p.ean || 'N/A'}" | Name: "${p.name}"`);
  });
  console.log('================================\n');
}

run().catch(console.error);
