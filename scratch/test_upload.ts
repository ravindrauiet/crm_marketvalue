import fs from 'fs';
import path from 'path';

// Parse .env manually
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

  // Test concatenated MAT. NO. extraction logic
  const rawSkus = ['100480034251310000368', '200480033631310000306'];
  console.log('Testing MAT. NO. regex extraction:');
  rawSkus.forEach(raw => {
    const m = raw.match(/(13\d{8})/);
    console.log(`Raw SKU: "${raw}" -> Cleaned MAT. NO.: "${m ? m[1] : raw}"`);
  });
}

run().catch(console.error);
