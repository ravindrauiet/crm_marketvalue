import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';

export function getUploadDir() {
  const dir = process.env.UPLOAD_DIR || 'public/uploads';
  const abs = path.join(process.cwd(), dir);
  if (!existsSync(abs)) mkdirSync(abs, { recursive: true });
  return abs;
}

export async function saveBufferToUploads(filename: string, buffer: Buffer) {
  const uploadsDir = getUploadDir();
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const uniqueName = `${Date.now()}_${safeName}`;
  const dest = path.join(uploadsDir, uniqueName);
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(dest);
    ws.on('error', reject);
    ws.on('finish', () => resolve());
    ws.write(buffer);
    ws.end();
  });
  return { filepath: dest, storedName: uniqueName };
}

export function publicPathForStoredFile(storedName: string) {
  const rel = path.join('/uploads', storedName).replace(/\\/g, '/');
  return rel;
}




