import { prisma } from './prisma';
import { extractProductsWithAI, ExtractedProduct } from './ai';

/**
 * Process a file with AI extraction and save products to database
 */
export async function processFileWithAI(fileId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new Error('File not found');
  }

  // Update status to PROCESSING
  await prisma.file.update({
    where: { id: fileId },
    data: { extractionStatus: 'PROCESSING' }
  });

  try {
    // Extract products using AI
    const extractionResult = await extractProductsWithAI(file.path, file.mimetype);

    // Save extracted data to file record
    await prisma.file.update({
      where: { id: fileId },
      data: {
        extractionStatus: 'COMPLETED',
        extractedData: JSON.stringify(extractionResult),
        extractionError: null
      }
    });

    // Save products to database
    let savedCount = 0;
    for (const productData of extractionResult.products) {
      try {
        // Upsert product
        const product = await prisma.product.upsert({
          where: { sku: productData.sku },
          update: {
            name: productData.name,
            brand: productData.brand || null,
            group: productData.group || null,
          },
          create: {
            sku: productData.sku,
            name: productData.name,
            brand: productData.brand || null,
            group: productData.group || null,
          }
        });

        // Update or create stock if quantity is provided
        if (productData.quantity !== undefined && productData.quantity !== null) {
          const existingStock = await prisma.stock.findFirst({
            where: { productId: product.id, location: 'TOTAL' }
          });

          if (existingStock) {
            await prisma.stock.update({
              where: { id: existingStock.id },
              data: { quantity: productData.quantity }
            });
          } else {
            await prisma.stock.create({
              data: {
                productId: product.id,
                location: 'TOTAL',
                quantity: productData.quantity,
                minStock: product.minStockThreshold || 0
              }
            });
          }
        }

        savedCount++;
      } catch (error: any) {
        console.error(`Error saving product ${productData.sku}:`, error.message);
        // Continue with other products even if one fails
      }
    }

    return {
      success: true,
      productsExtracted: extractionResult.products.length,
      productsSaved: savedCount,
      metadata: extractionResult.metadata
    };
  } catch (error: any) {
    // Update status to FAILED
    await prisma.file.update({
      where: { id: fileId },
      data: {
        extractionStatus: 'FAILED',
        extractionError: error.message
      }
    });

    throw error;
  }
}

/**
 * Get extraction status for a file
 */
export async function getFileExtractionStatus(fileId: string) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      filename: true,
      extractionStatus: true,
      extractionError: true,
      extractedData: true
    }
  });

  if (!file) return null;

  let extractedProducts = null;
  if (file.extractedData) {
    try {
      const data = JSON.parse(file.extractedData);
      extractedProducts = data.products || [];
    } catch {
      // Invalid JSON
    }
  }

  return {
    ...file,
    extractedProducts
  };
}

