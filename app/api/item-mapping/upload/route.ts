import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';

// POST /api/item-mapping/upload
// Upload bulk item mappings via Excel/CSV
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse Excel/CSV
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in file' }, { status: 400 });
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const row of rawRows) {
      const keys = Object.keys(row);
      const find = (patterns: string[]) => {
        for (const pattern of patterns) {
          const k = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(pattern.toLowerCase().replace(/[^a-z0-9]/g, '')));
          if (k) return row[k];
        }
        return '';
      };

      const chainName = String(find(['chainname', 'chain'])).toUpperCase().trim();
      const chainItemCode = String(find(['chainitemcode', 'chaincode', 'itemcode'])).trim();
      const chainItemName = String(find(['chainitemname', 'chainname', 'itemname'])).trim();
      const tallyItemName = String(find(['tallyitemname', 'tallyname', 'tally'])).trim();
      const companyItemCode = String(find(['companycode', 'companyitemcode']));
      const pcsPerCase = parseInt(String(find(['pcspercase', 'pcscase', 'conversion']))) || 1;

      if (!chainName || !chainItemCode) continue;

      const existing = await prisma.itemMapping.findFirst({
        where: {
          chainName,
          chainItemCode,
        }
      });

      if (existing) {
        await prisma.itemMapping.update({
          where: { id: existing.id },
          data: {
            chainItemName: chainItemName || existing.chainItemName,
            tallyItemName: tallyItemName || existing.tallyItemName,
            companyItemCode: companyItemCode || existing.companyItemCode,
            pcsPerCase,
          }
        });
        updatedCount++;
      } else {
        await prisma.itemMapping.create({
          data: {
            chainName,
            chainItemCode,
            chainItemName,
            tallyItemName,
            companyItemCode,
            pcsPerCase,
            isActive: true,
          }
        });
        createdCount++;
      }
    }

    return NextResponse.json({
      success: true,
      created: createdCount,
      updated: updatedCount,
      totalProcessed: createdCount + updatedCount
    });

  } catch (err: any) {
    console.error('Item Mapping upload error:', err);
    return NextResponse.json({ error: 'Upload failed: ' + err.message }, { status: 500 });
  }
}
