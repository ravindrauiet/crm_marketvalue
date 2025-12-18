
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const PO_DIR = path.join(__dirname, '../../PO automation');

async function main() {
    console.log('Starting DMart file import...');

    if (!fs.existsSync(PO_DIR)) {
        console.error('Directory not found:', PO_DIR);
        return;
    }

    const dmartFiles = [
        'MOTHERS  PO_dmart.pdf',
        'MOTHERS PAPAD PO_dmart.pdf',
        'MOTHERS po_dmart.pdf'
    ];

    console.log(`Importing ${dmartFiles.length} DMart files...`);

    const recordName = `DMart Import Batch`;
    let record = await prisma.record.findFirst({ where: { name: recordName } });

    if (!record) {
        record = await prisma.record.create({
            data: { name: recordName }
        });
        console.log(`Created Record: ${record.id}`);
    } else {
        console.log(`Using existing Record: ${record.id}`);
    }

    for (const filename of dmartFiles) {
        const filePath = path.join(PO_DIR, filename);

        if (!fs.existsSync(filePath)) {
            console.log(`File not found: ${filename}`);
            continue;
        }

        const stats = fs.statSync(filePath);

        const existing = await prisma.file.findFirst({
            where: { recordId: record.id, filename }
        });

        if (!existing) {
            const file = await prisma.file.create({
                data: {
                    filename,
                    path: filePath,
                    mimetype: 'application/pdf',
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

    console.log('\\nDone! Files are ready for processing.');
    console.log('Go to http://localhost:3000/records to view and process them.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
