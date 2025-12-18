
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const PO_DIR = path.join(__dirname, '../../PO automation');

async function main() {
    console.log('Starting Reliance file import...');

    if (!fs.existsSync(PO_DIR)) {
        console.error('Directory not found:', PO_DIR);
        return;
    }

    const relianceFiles = [
        'PO. INTM_ 5110802591 .PDF Reliance Retail Limited_mix.PDF',
        'PO. INTM_ 5110804155 .PDF Reliance Retail Limited_marvel and eastern.PDF',
        'PO. INTM_ 5110829728 .PDF Reliance Retail Limited_marvel.PDF',
        'PO. INTM_ 5111235660 .PDF Metro Cash And Carry Ind_marvel2.PDF',
        'PO. INTM_ 5111235708 .PDF Metro Cash And Carry Ind_metro3.PDF',
        'PO. INTM_ 5111248551 .PDF Metro Cash And Carry Ind_marvel_metro.PDF',
        'PO. INTM_ 9201910324 .PDF Reliance Retail Limited_eastern.PDF'
    ];

    console.log(`Importing ${relianceFiles.length} Reliance/Metro files...`);

    const recordName = `Reliance Import Batch`;
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

    for (const filename of relianceFiles) {
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
            const mimetype = 'application/pdf';

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
