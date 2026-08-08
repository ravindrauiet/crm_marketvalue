import { prisma } from '../lib/prisma';
import { uploadToImageKit } from '../lib/imagekit';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

async function main() {
  console.log('🔄 Starting ImageKit Sync Script for existing files...');

  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

  if (!publicKey || !privateKey || publicKey.includes('YOUR_') || privateKey.includes('YOUR_')) {
    console.error('❌ Error: ImageKit API keys are missing in .env file!');
    console.error('Please add valid IMAGEKIT_PUBLIC_KEY and IMAGEKIT_PRIVATE_KEY values to crm-app/.env first.');
    process.exit(1);
  }

  // 1. Sync CRM Files
  const filesToSync = await prisma.file.findMany({
    where: { OR: [{ imagekitUrl: null }, { imagekitUrl: '' }] }
  });

  console.log(`📁 Found ${filesToSync.length} CRM File(s) missing ImageKit URL.`);

  for (const f of filesToSync) {
    if (f.path && existsSync(f.path)) {
      try {
        const buffer = readFileSync(f.path);
        const res = await uploadToImageKit(buffer, f.filename, '/crm-documents');
        if (res?.url) {
          await prisma.file.update({
            where: { id: f.id },
            data: { imagekitUrl: res.url, imagekitFileId: res.fileId }
          });
          console.log(`  ✅ Synced File "${f.filename}" -> ${res.url}`);
        }
      } catch (err: any) {
        console.error(`  ❌ Failed to sync file ID ${f.id}:`, err.message);
      }
    } else {
      console.warn(`  ⚠️ Local file path does not exist for File ID ${f.id}: ${f.path}`);
    }
  }

  // 2. Sync Purchase Bills
  const billsToSync = await prisma.purchaseBill.findMany({
    where: { OR: [{ imagekitUrl: null }, { imagekitUrl: '' }] }
  });

  console.log(`🧾 Found ${billsToSync.length} Purchase Bill(s) missing ImageKit URL.`);

  for (const b of billsToSync) {
    if (b.filePath && b.filePath.startsWith('data:')) {
      try {
        const matches = b.filePath.match(/^data:.+;base64,(.+)$/);
        if (matches && matches[1]) {
          const buffer = Buffer.from(matches[1], 'base64');
          const fileName = b.fileName || `bill_${b.id}.pdf`;
          const res = await uploadToImageKit(buffer, fileName, '/purchase-bills');
          if (res?.url) {
            await prisma.purchaseBill.update({
              where: { id: b.id },
              data: { imagekitUrl: res.url }
            });
            console.log(`  ✅ Synced Purchase Bill "${fileName}" -> ${res.url}`);
          }
        }
      } catch (err: any) {
        console.error(`  ❌ Failed to sync Purchase Bill ID ${b.id}:`, err.message);
      }
    }
  }

  // 3. Sync POs
  const posToSync = await prisma.chainPurchaseOrder.findMany({
    where: { OR: [{ imagekitUrl: null }, { imagekitUrl: '' }] }
  });

  console.log(`📦 Found ${posToSync.length} Purchase Order(s) missing ImageKit URL.`);

  for (const po of posToSync) {
    if (po.filePath && po.filePath.startsWith('data:')) {
      try {
        const matches = po.filePath.match(/^data:.+;base64,(.+)$/);
        if (matches && matches[1]) {
          const buffer = Buffer.from(matches[1], 'base64');
          const fileName = po.fileName || `po_${po.poNumber}.pdf`;
          const res = await uploadToImageKit(buffer, fileName, '/po-documents');
          if (res?.url) {
            await prisma.chainPurchaseOrder.update({
              where: { id: po.id },
              data: { imagekitUrl: res.url }
            });
            console.log(`  ✅ Synced PO "${po.poNumber}" -> ${res.url}`);
          }
        }
      } catch (err: any) {
        console.error(`  ❌ Failed to sync PO ID ${po.id}:`, err.message);
      }
    }
  }

  console.log('🎉 ImageKit sync process completed!');
}

main()
  .catch(err => console.error('Unhandled script error:', err))
  .finally(() => prisma.$disconnect());
