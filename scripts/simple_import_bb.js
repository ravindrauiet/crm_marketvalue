
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Initialize Prisma manually
const prisma = new PrismaClient();

// Import AI processor manually (stubbing it if complex import fails)
// We will try to require it first
let processFileWithAI;
try {
    // Try to load the transpiled output if available
    // Or just mock it if we can't reliably load the TS source from JS
    // For this environment, we might need a workaround if ts-node/tsx keeps failing
    // Let's rely on the fact that 'server-side' code in next.js is often TS
    // If we can't load the TS module, we can't run the AI extraction from a pure JS script easily without compiling app

    // ALTERNATIVE: Use ts-node purely for the AI lib part? No, that mixes contexts.
    // Best bet: Try to require the TS file via 'tsx' but if that fails, we are stuck.

    // Since 'tsx' failed on the whole script, let's try a minimal JS script that just creates the records first to verify DB access
    // Then we can trigger AI separately or debug that part.
} catch (e) {
    console.error("Could not load processor", e);
}

const PO_DIR = path.join(__dirname, '../../PO automation');

async function main() {
    console.log('Starting simplified import...');

    if (!fs.existsSync(PO_DIR)) {
        console.error('Directory not found:', PO_DIR);
        return;
    }

    const files = fs.readdirSync(PO_DIR);
    const bbFiles = files.filter(f => f.toLowerCase().includes('big basket') || f.includes('Innovative Retail'));

    console.log(`Found ${bbFiles.length} BigBasket files.`);

    const recordName = `BigBasket Import Batch`;
    let record = await prisma.record.findFirst({ where: { name: recordName } });

    if (!record) {
        record = await prisma.record.create({
            data: { name: recordName, status: 'OPEN' }
        });
        console.log(`Created Record: ${record.id}`);
    }

    for (const filename of bbFiles) {
        const filePath = path.join(PO_DIR, filename);
        const stats = fs.statSync(filePath);

        const existing = await prisma.file.findFirst({
            where: { recordId: record.id, filename }
        });

        if (!existing) {
            const file = await prisma.file.create({
                data: {
                    filename,
                    path: filePath,
                    mimetype: filename.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
                    sizeBytes: stats.size,
                    recordId: record.id,
                    extractionStatus: 'PENDING'
                }
            });
            console.log(`Created File: ${filename} (${file.id})`);
        } else {
            console.log(`File exists: ${filename} (${existing.id})`);
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
