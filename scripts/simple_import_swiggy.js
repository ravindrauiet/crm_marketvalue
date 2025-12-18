
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const PO_DIR = path.join(__dirname, '../../PO automation');

async function main() {
    console.log('Starting Swiggy file import...');

    if (!fs.existsSync(PO_DIR)) {
        console.error('Directory not found:', PO_DIR);
        return;
    }

    const swiggyFiles = [
        'SOTY-1N60000475-ETPPO03012_mothers_swiggy.pdf',
        'SOTY-1N60000475-ETPPO03012_mtr_swiggy.xls',
        'SOTY-1N60000475-FC5PO242865_eastern_swiggy.pdf',
        'SOTY-1N60000475-FC5PO242913_mtr_swiggy.pdf',
        'SOTY-1N60000475-FC5PO242913_mtr_swiggy.xls',
        'SOTY-1N60000475-KOWPO182140_eastern_swiggy.pdf',
        'SOTY-1N60000475-KOWPO182140_eastern_swiggy.xls',
        'SOTY-1N60000475-KWBPO23025_eastern_swiggy1.pdf',
        'SOTY-1N60000475-KWBPO23025_eastern_swiggy1.xls'
    ];

    console.log(`Importing ${swiggyFiles.length} Swiggy files...`);

    const recordName = `Swiggy Import Batch`;
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

    for (const filename of swiggyFiles) {
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
            else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) mimetype = 'application/vnd.ms-excel';

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
