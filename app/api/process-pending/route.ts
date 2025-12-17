
import { processFileWithAI } from '@/lib/documentProcessor';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { recordId, vendor } = await request.json();

        if (!recordId) {
            return NextResponse.json({ error: 'Record ID required' }, { status: 400 });
        }

        const files = await prisma.file.findMany({
            where: {
                recordId: recordId,
                extractionStatus: 'PENDING'
            }
        });

        console.log(`Found ${files.length} pending files for record ${recordId}`);

        const results = [];
        for (const file of files) {
            try {
                console.log(`Processing file ${file.id} (${file.filename})...`);
                const result = await processFileWithAI(file.id, { vendor: vendor || 'default' });
                results.push({ filename: file.filename, status: 'SUCCESS', result });
            } catch (e: any) {
                console.error(`Error processing ${file.filename}:`, e);
                results.push({ filename: file.filename, status: 'FAILED', error: e.message });
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            details: results
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
