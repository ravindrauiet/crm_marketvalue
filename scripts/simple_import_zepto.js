
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const PO_DIR = path.join(__dirname, '../../PO automation');

async function main() {
    console.log('Starting Zepto file import...');

    if (!fs.existsSync(PO_DIR)) {
        console.error('Directory not found:', PO_DIR);
        return;
    }

    const zeptoFiles = [
        'P2145432_marvel zepto1.pdf',
        'P2145432_marvel zepto.pdf',
        'P2086746_mix of all Brand Zepto.pdf',
        'P2086009_Eastern_zepto1.pdf',
        'P2057888_eastern_zepto.pdf',
        'P2057888_eastern_zepto.csv',
        'P2057147_mothers zepto3.pdf',
        'P2057147_mothers zepto1.pdf',
        'P2057147_mothers zepto.pdf',
        'P2057147_mothers depto.pdf',
        'P1997630_mothers_zepto.csv',
        'P1997630_marvel_zepto.csv',
        'P1997016_eastern_zepto4.pdf',
        'P1996927_mothers_zepto5.pdf',
        'P1978276_mothers1_zepto.csv',
        'P1969282_mothers_zepto4.pdf',
        'P1952685_eastern_zepto4.pdf',
        'P1952685_eastern_zepto3.csv'
    ];

    console.log(`Importing ${zeptoFiles.length} Zepto files...`);

    const recordName = `Zepto Import Batch`;
    let record = await prisma.record.findFirst({ where: { name: recordName } });

    if (!record) {
        record = await prisma.record.create({
            data: { name: recordName }
        });
        console.log(`Created Record: ${record.id}`);
    } else {
        console.log(`Using existing Record: ${record.id}`);
    }

    let created = 0, skipped = 0, notFound = 0;

    for (const filename of zeptoFiles) {
        const filePath = path.join(PO_DIR, filename);

        if (!fs.existsSync(filePath)) {
            console.log(`NOT FOUND: ${filename}`);
            notFound++;
            continue;
        }

        const stats = fs.statSync(filePath);

        const existing = await prisma.file.findFirst({
            where: { recordId: record.id, filename }
        });

        if (!existing) {
            let mimetype = 'application/pdf';
            if (filename.endsWith('.csv')) mimetype = 'text/csv';
            else if (filename.endsWith('.xlsx')) mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

            const file = await prisma.file.create({
                data: {
                    filename,
                    path: filePath,
                    mimetype,
                    sizeBytes: stats.size,
                    recordId: record.id,
                    extractionStatus: 'PENDING'
                }
            });
            console.log(`CREATED: ${filename} (${file.id})`);
            created++;
        } else {
            console.log(`EXISTS: ${filename}`);
            skipped++;
        }
    }

    console.log(`\nDone! Created: ${created}, Skipped: ${skipped}, Not Found: ${notFound}`);
    console.log('Go to http://localhost:3000/records to view and process them.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
