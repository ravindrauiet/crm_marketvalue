import ImageKit from 'imagekit';

// Helper to instantiate ImageKit client if keys exist in environment
function getImageKitClient(): ImageKit | null {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/glomin';

  if (!publicKey || !privateKey) {
    return null;
  }

  return new ImageKit({
    publicKey,
    privateKey,
    urlEndpoint,
  });
}

export interface ImageKitUploadResult {
  url: string;
  fileId: string;
  name: string;
  filePath: string;
}

/**
 * Uploads a file buffer, base64 string, or stream to ImageKit.io
 * @param fileBuffer Buffer, base64 data string, or readable stream
 * @param fileName Target filename
 * @param folder Destination folder on ImageKit (e.g. '/crm-documents')
 */
export async function uploadToImageKit(
  fileBuffer: Buffer | string,
  fileName: string,
  folder: string = '/bhavishcrm'
): Promise<ImageKitUploadResult | null> {
  try {
    const client = getImageKitClient();
    if (!client) {
      console.log('ℹ️ [IMAGEKIT] ImageKit keys (IMAGEKIT_PUBLIC_KEY / IMAGEKIT_PRIVATE_KEY) not present in .env. Cloud upload skipped.');
      return null;
    }

    // Clean up filename
    const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');

    console.log(`☁️ [IMAGEKIT START] Uploading "${safeName}" to folder "${folder}"...`);

    const result = await client.upload({
      file: fileBuffer,
      fileName: safeName,
      folder,
      useUniqueFileName: true,
    });

    console.log(`✅ [IMAGEKIT SUCCESS] Uploaded "${fileName}" -> ${result.url}`);

    return {
      url: result.url,
      fileId: result.fileId,
      name: result.name,
      filePath: result.filePath,
    };
  } catch (error: any) {
    console.error(`❌ [IMAGEKIT ERROR] Failed to upload "${fileName}":`, error?.message || error);
    return null;
  }
}
