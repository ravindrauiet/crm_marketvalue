import { prisma } from './prisma';
import { extractProductsWithAI, ExtractedProduct } from './ai';

export type ProcessingOptions = {
  /**
   * If true, only update existing products (don't create new ones)
   * If false, create new products if SKU doesn't exist
   */
  matchExistingOnly?: boolean;
  /**
   * If true, add quantity to existing stock
   * If false, replace stock quantity with extracted value
   */
  addToStock?: boolean;
  /**
   * Vendor/source of the document for specialized extraction
   * Options: 'default', 'amazon', 'blinkit', 'dmart', 'zepto', 'swiggy', 'eastern'
   */
  vendor?: string;
};


export type ProcessingResult = {
  success: boolean;
  productsExtracted: number;
  productsMatched: number;
  productsUpdated: number;
  productsCreated: number;
  productsUnmatched: ExtractedProduct[];
  stockUpdated: number;
  metadata?: any;
  errors?: string[];
};

/**
 * Process a file with AI extraction and match products from database
 * This function matches product codes from extracted data with existing products in the database
 * and updates their stock counts and other information.
 */
export async function processFileWithAI(
  fileId: string,
  options: ProcessingOptions = {}
): Promise<ProcessingResult> {
  // Default: Create new products if they don't exist, and ADD to stock (not replace)
  const { matchExistingOnly = false, addToStock = true, vendor = 'default' } = options;

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    throw new Error('File not found');
  }

  // Update status to PROCESSING
  await prisma.file.update({
    where: { id: fileId },
    data: { extractionStatus: 'PROCESSING' }
  });

  const result: ProcessingResult = {
    success: false,
    productsExtracted: 0,
    productsMatched: 0,
    productsUpdated: 0,
    productsCreated: 0,
    productsUnmatched: [],
    stockUpdated: 0,
    errors: []
  };

  try {
    // Determine extraction method based on file type
    let extractionResult;

    // Check if it's an Excel file
    if (file.mimetype.includes('excel') ||
      file.mimetype.includes('spreadsheet') ||
      file.filename.endsWith('.xlsx') ||
      file.filename.endsWith('.xls')) {

      console.log(`\n=== Processing Excel File: ${file.filename} (Vendor: ${vendor}) ===`);
      console.log('Using deterministic Excel extractor (bypassing AI)...');

      // Use efficient deterministic extraction
      const { extractFromExcel } = await import('./excel-extractor');
      extractionResult = await extractFromExcel(file.path, vendor);

    } else {
      // Use AI for PDFs, Images, etc.
      extractionResult = await extractProductsWithAI(file.path, file.mimetype, vendor);
    }
    result.productsExtracted = extractionResult.products.length;
    result.metadata = {
      ...extractionResult.metadata,
      rawDocumentInfo: extractionResult.rawDocumentInfo  // Include raw document info in result
    };


    // Save extracted data to file record - BOTH rawDocumentInfo and products
    await prisma.file.update({
      where: { id: fileId },
      data: {
        extractionStatus: 'COMPLETED',
        rawDocumentInfo: JSON.stringify(extractionResult.rawDocumentInfo || {}),  // All document info
        extractedData: JSON.stringify({  // Structured product data
          products: extractionResult.products,
          metadata: extractionResult.metadata
        }),
        extractionError: null
      }
    });

    // Aggregate products by SKU + Name combination (same product appearing multiple times)
    // This handles cases where the same product appears in different parts of the document
    const productMap = new Map<string, {
      sku: string;
      name: string;
      brand?: string;
      group?: string;
      quantity: number;
      price?: number;
      description?: string;
      occurrences: number;
    }>();

    console.log('\n=== Aggregating Products ===');
    console.log(`Total products from AI: ${extractionResult.products.length}`);

    for (const productData of extractionResult.products) {
      const sku = String(productData.sku || '').trim();
      const name = String(productData.name || '').trim();

      // Skip products with invalid SKU or name
      if (!sku || !name) {
        const errorMsg = `Skipping product: Invalid SKU or name (SKU: "${sku}", Name: "${name}")`;
        console.warn(errorMsg);
        result.errors?.push(errorMsg);
        continue;
      }

      // Use SKU + Name as unique key (same SKU with different name = different product)
      const key = `${sku}::${name}`;
      const quantity = productData.quantity ? Number(productData.quantity) : 0;

      if (productMap.has(key)) {
        // Product already seen - aggregate quantities
        const existing = productMap.get(key)!;
        existing.quantity += quantity;
        existing.occurrences += 1;
        // Update other fields if they're missing in existing but present in new
        if (!existing.brand && productData.brand) existing.brand = String(productData.brand).trim();
        if (!existing.group && productData.group) existing.group = String(productData.group).trim();
        if (!existing.description && productData.description) existing.description = String(productData.description).trim();
        if (!existing.price && productData.price) existing.price = Number(productData.price);
      } else {
        // New product
        productMap.set(key, {
          sku,
          name,
          brand: productData.brand ? String(productData.brand).trim() : undefined,
          group: productData.group ? String(productData.group).trim() : undefined,
          quantity,
          price: productData.price ? Number(productData.price) : undefined,
          description: productData.description ? String(productData.description).trim() : undefined,
          occurrences: 1
        });
      }
    }

    const aggregatedProducts = Array.from(productMap.values());
    const duplicateCount = extractionResult.products.length - aggregatedProducts.length;

    console.log(`After aggregation: ${aggregatedProducts.length} unique products`);
    if (duplicateCount > 0) {
      console.log(`Aggregated ${duplicateCount} duplicate occurrences`);
      // Show which products were aggregated
      const aggregated = aggregatedProducts.filter(p => p.occurrences > 1);
      if (aggregated.length > 0) {
        console.log('Products with multiple occurrences (quantities aggregated):');
        aggregated.forEach(p => {
          console.log(`  - SKU: "${p.sku}", Name: "${p.name}" (${p.occurrences} times, total qty: ${p.quantity})`);
        });
      }
    }
    console.log('================================\n');

    // Process each aggregated product
    for (const productData of aggregatedProducts) {
      try {
        const sku = productData.sku;
        const name = productData.name;

        // Try to find existing product by SKU (SKU is the primary identifier)
        // If SKU matches, we use the existing product even if name differs
        const existingProduct = await prisma.product.findUnique({
          where: { sku: sku }
        });

        if (existingProduct) {
          // Log if name differs but SKU matches
          const nameDiffers = existingProduct.name.toLowerCase().trim() !== name.toLowerCase().trim();
          if (nameDiffers) {
            console.log(`⚠️  SKU "${sku}" matches existing product, but name differs:`);
            console.log(`   Existing: "${existingProduct.name}"`);
            console.log(`   Extracted: "${name}"`);
            console.log(`   → Will update existing product and add stock`);
          }
        }

        if (!existingProduct) {
          // Product doesn't exist in database
          if (matchExistingOnly) {
            // Only match existing products - skip this one
            result.productsUnmatched.push(productData);
            continue;
          } else {
            // Create new product first
            try {
              const newProduct = await prisma.product.create({
                data: {
                  sku: sku,
                  name: name,
                  brand: productData.brand ? String(productData.brand).trim() : null,
                  group: productData.group ? String(productData.group).trim() : null,
                  description: productData.description ? String(productData.description).trim() : null,
                  price: productData.price ? Number(productData.price) : null,
                  cost: productData.price ? Number(productData.price) : null, // Use price as cost if cost not provided
                }
              });

              // Then add stock quantity (always add, even for new products)
              // Note: quantity is already aggregated if product appeared multiple times
              if (productData.quantity !== undefined && productData.quantity !== null && productData.quantity > 0) {
                await prisma.stock.create({
                  data: {
                    productId: newProduct.id,
                    location: 'TOTAL',
                    quantity: Number(productData.quantity),
                    minStock: newProduct.minStockThreshold || 0
                  }
                });

                // Create stock transaction for audit trail
                await prisma.stockTransaction.create({
                  data: {
                    productId: newProduct.id,
                    type: 'IN',
                    quantity: Number(productData.quantity),
                    previousQty: 0,
                    newQty: Number(productData.quantity),
                    reason: 'IMPORT',
                    reference: fileId,
                    notes: `Stock added from file: ${file.filename}`
                  }
                });

                result.stockUpdated++;
              }

              result.productsCreated++;
              result.productsMatched++;
            } catch (createError: any) {
              // Handle duplicate SKU or other creation errors
              if (createError.code === 'P2002') {
                // Unique constraint violation - SKU already exists (race condition)
                const errorMsg = `Product with SKU "${sku}" already exists (possibly created by another process)`;
                console.warn(errorMsg);
                result.errors?.push(errorMsg);
                // Try to find and update the existing product instead
                const existingProduct = await prisma.product.findUnique({
                  where: { sku: sku }
                });
                if (existingProduct) {
                  // Update existing product and add stock
                  await prisma.product.update({
                    where: { id: existingProduct.id },
                    data: {
                      name: name,
                      brand: productData.brand ? String(productData.brand).trim() : existingProduct.brand,
                      group: productData.group ? String(productData.group).trim() : existingProduct.group,
                    }
                  });

                  // Add stock
                  if (productData.quantity !== undefined && productData.quantity !== null && productData.quantity > 0) {
                    const existingStock = await prisma.stock.findFirst({
                      where: { productId: existingProduct.id, location: 'TOTAL' }
                    });
                    const previousQty = existingStock?.quantity || 0;
                    const newQty = previousQty + Number(productData.quantity);

                    if (existingStock) {
                      await prisma.stock.update({
                        where: { id: existingStock.id },
                        data: { quantity: newQty }
                      });
                    } else {
                      await prisma.stock.create({
                        data: {
                          productId: existingProduct.id,
                          location: 'TOTAL',
                          quantity: newQty,
                          minStock: existingProduct.minStockThreshold || 0
                        }
                      });
                    }

                    await prisma.stockTransaction.create({
                      data: {
                        productId: existingProduct.id,
                        type: 'IN',
                        quantity: Number(productData.quantity),
                        previousQty,
                        newQty,
                        reason: 'IMPORT',
                        reference: fileId,
                        notes: `Stock added from file: ${file.filename}`
                      }
                    });

                    result.stockUpdated++;
                  }

                  result.productsUpdated++;
                  result.productsMatched++;
                }
              } else {
                throw createError; // Re-throw if it's a different error
              }
            }
          }
        } else {
          // Product exists (matched by SKU) - update it
          // Note: We keep existing product name unless extracted name is significantly different
          // This prevents overwriting correct names with variations from PDF
          const shouldUpdateName = name &&
            name.toLowerCase().trim() !== existingProduct.name.toLowerCase().trim() &&
            name.length > 3; // Only update if name is meaningful

          const updatedProduct = await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              // Update name only if it's different and meaningful
              ...(shouldUpdateName && { name: name }),
              brand: productData.brand ? String(productData.brand).trim() : existingProduct.brand,
              group: productData.group ? String(productData.group).trim() : existingProduct.group,
              description: productData.description ? String(productData.description).trim() : existingProduct.description,
              // Only update price/cost if provided
              ...(productData.price !== undefined && { price: Number(productData.price) }),
              ...(productData.price !== undefined && { cost: Number(productData.price) }),
            }
          });

          // Update stock if quantity is provided
          if (productData.quantity !== undefined && productData.quantity !== null && productData.quantity > 0) {
            const existingStock = await prisma.stock.findFirst({
              where: { productId: existingProduct.id, location: 'TOTAL' }
            });

            const previousQty = existingStock?.quantity || 0;
            let newQty: number;
            let quantityToAdd = Number(productData.quantity);

            if (addToStock) {
              // Add to existing stock (default behavior)
              newQty = previousQty + quantityToAdd;
            } else {
              // Replace stock quantity
              newQty = quantityToAdd;
            }

            if (existingStock) {
              await prisma.stock.update({
                where: { id: existingStock.id },
                data: { quantity: newQty }
              });
            } else {
              await prisma.stock.create({
                data: {
                  productId: existingProduct.id,
                  location: 'TOTAL',
                  quantity: newQty,
                  minStock: existingProduct.minStockThreshold || 0
                }
              });
            }

            // Create stock transaction for audit trail
            const quantityChange = newQty - previousQty;
            if (quantityChange !== 0) {
              await prisma.stockTransaction.create({
                data: {
                  productId: existingProduct.id,
                  type: quantityChange > 0 ? 'IN' : 'OUT',
                  quantity: Math.abs(quantityChange),
                  previousQty,
                  newQty,
                  reason: 'IMPORT',
                  reference: fileId,
                  notes: `${addToStock ? 'Added' : 'Updated'} stock from file: ${file.filename}`
                }
              });
            }

            result.stockUpdated++;
          }

          result.productsUpdated++;
          result.productsMatched++;
        }
      } catch (error: any) {
        const errorMsg = `Error processing product SKU "${productData.sku}" (${productData.name}): ${error.message}${error.code ? ` [Code: ${error.code}]` : ''}`;
        console.error(errorMsg, error);
        result.errors?.push(errorMsg);
        // Continue with other products even if one fails
      }
    }

    result.success = true;

    // Log summary
    console.log(`\n=== File Processing Summary for ${file.filename} ===`);
    console.log(`Products Extracted: ${result.productsExtracted}`);
    console.log(`Products Matched: ${result.productsMatched}`);
    console.log(`Products Created: ${result.productsCreated}`);
    console.log(`Products Updated: ${result.productsUpdated}`);
    console.log(`Products Unmatched: ${result.productsUnmatched.length}`);
    console.log(`Stock Updated: ${result.stockUpdated}`);
    console.log(`Errors: ${result.errors?.length || 0}`);
    if (result.errors && result.errors.length > 0) {
      console.log('Errors:', result.errors.slice(0, 5)); // Show first 5 errors
    }
    console.log('==========================================\n');

    // Update file record with processing summary
    const summary = {
      ...result,
      productsUnmatched: result.productsUnmatched.map(p => ({
        sku: p.sku,
        name: p.name,
        quantity: p.quantity
      }))
    };

    await prisma.file.update({
      where: { id: fileId },
      data: {
        extractedData: JSON.stringify({
          ...extractionResult,
          processingSummary: summary
        })
      }
    });

    return result;
  } catch (error: any) {
    // Update status to FAILED
    await prisma.file.update({
      where: { id: fileId },
      data: {
        extractionStatus: 'FAILED',
        extractionError: error.message
      }
    });

    result.errors?.push(error.message);
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
  let processingSummary = null;

  if (file.extractedData) {
    try {
      const data = JSON.parse(file.extractedData);
      extractedProducts = data.products || [];
      processingSummary = data.processingSummary || null;
    } catch {
      // Invalid JSON
    }
  }

  return {
    ...file,
    extractedProducts,
    processingSummary
  };
}

