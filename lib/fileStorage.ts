import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

export function getUploadDir() {
  // Netlify & Vercel serverless functions have a read-only filesystem outside /tmp
  if (process.env.NETLIFY || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === 'production') {
    const tmpDir = path.join(os.tmpdir(), 'uploads');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }

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












/**
 * Loads a stored upload as a Buffer. Uploads may be kept as a data: URI, a remote
 * (ImageKit) URL, an absolute local path, or a /uploads/... public path. On serverless
 * hosts local files disappear between requests, so a remote fallback URL is tried last.
 */
export async function readStoredFile(location: string | null | undefined, fallbackUrl?: string | null): Promise<Buffer> {
  const candidates = [location, fallbackUrl].filter((v): v is string => !!v);

  for (const loc of candidates) {
    if (loc.startsWith('data:')) {
      return Buffer.from(loc.split(',')[1] || '', 'base64');
    }
    if (/^https?:\/\//i.test(loc)) {
      const res = await fetch(loc);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      continue;
    }
    const localPaths = path.isAbsolute(loc) ? [loc] : [path.join(process.cwd(), 'public', loc), path.join(getUploadDir(), path.basename(loc))];
    for (const p of localPaths) {
      if (existsSync(p)) return readFileSync(p);
    }
  }

  throw new Error('Stored file could not be found (it may have been removed from temporary storage). Please upload it again.');
}

/** Ensures a local copy of a stored file exists (for parsers that need a path) and returns that path */
export async function ensureLocalFile(location: string | null | undefined, fallbackUrl: string | null | undefined, filename: string): Promise<string> {
  if (location && path.isAbsolute(location) && existsSync(location)) return location;
  const buf = await readStoredFile(location, fallbackUrl);
  const { filepath } = await saveBufferToUploads(filename, buf);
  return filepath;
}
