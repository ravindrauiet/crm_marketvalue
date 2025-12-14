import { prisma } from './prisma';

export async function listRecords() {
  const rows = await prisma.record.findMany({
    orderBy: { createdAt: 'desc' },
    include: { files: true }
  });
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    files: r.files.map(f => ({
      id: f.id,
      filename: f.filename,
      mimetype: f.mimetype,
      extractionStatus: f.extractionStatus,
      rawDocumentInfo: f.rawDocumentInfo,
      extractedData: f.extractedData
    }))
  }));
}

export async function getRecord(id: string) {
  const r = await prisma.record.findUnique({ where: { id }, include: { files: true } });
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    files: r.files.map(f => ({
      id: f.id,
      filename: f.filename,
      mimetype: f.mimetype,
      extractionStatus: f.extractionStatus,
      rawDocumentInfo: f.rawDocumentInfo,  // ALL document information
      extractedData: f.extractedData,       // Structured product data
      extractionError: f.extractionError
    }))
  };
}






