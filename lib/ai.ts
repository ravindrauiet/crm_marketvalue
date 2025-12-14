import OpenAI from 'openai';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export type ExtractedProduct = {
  sku: string;
  name: string;
  brand?: string;
  group?: string;
  quantity?: number;
  price?: number;
  description?: string;
  [key: string]: any; // Allow additional fields
};

export type ExtractionResult = {
  products: ExtractedProduct[];
  metadata?: {
    documentType?: string;
    totalItems?: number;
    date?: string;
    [key: string]: any;
  };
};

/**
 * Extract text content from different file types
 */
async function extractTextFromFile(filePath: string, mimetype: string): Promise<string> {
  if (mimetype.includes('pdf')) {
    const dataBuffer = readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);

    // Log PDF extraction info
    console.log('\n=== PDF Text Extraction ===');
    console.log(`PDF Pages: ${pdfData.numpages}`);
    console.log(`Text Length: ${pdfData.text.length} characters`);
    console.log(`First 500 chars: ${pdfData.text.substring(0, 500)}...`);
    console.log('===========================\n');

    return pdfData.text;
  } else if (mimetype.includes('excel') || mimetype.includes('spreadsheet') ||
    filePath.endsWith('.xls') || filePath.endsWith('.xlsx')) {
    const buf = readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Log Excel extraction info
    console.log('\n=== Excel Text Extraction ===');
    console.log(`Sheets: ${wb.SheetNames.length}`);
    console.log(`Sheet Names: ${wb.SheetNames.join(', ')}`);

    // Extract from ALL sheets, not just the first one
    let allData: any[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet);
      console.log(`Sheet "${sheetName}": ${json.length} rows`);
      allData = allData.concat(json);
    }

    console.log(`Total rows across all sheets: ${allData.length}`);
    console.log('============================\n');

    return JSON.stringify(allData, null, 2);
  } else if (mimetype.includes('word') || filePath.endsWith('.docx')) {
    // Extract text from .docx files using mammoth
    const dataBuffer = readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer: dataBuffer });
    return result.value;
  } else if (filePath.endsWith('.doc')) {
    // .doc files are binary format, harder to parse without additional libraries
    // For now, return a message - consider converting to .docx or using a library like antiword
    throw new Error('Legacy .doc format not fully supported. Please convert to .docx format.');
  } else {
    // Try to read as text
    return readFileSync(filePath, 'utf-8');
  }
}

/**
 * Get vendor-specific extraction prompt instructions
 */
function getVendorSpecificPrompt(vendor: string): string {
  const baseInstructions = `CRITICAL: Extract EVERY SINGLE product from this document. Be COMPLETE and THOROUGH.

EXTRACTION INSTRUCTIONS:
1. Read the ENTIRE document from start to finish - do not skip any sections
2. Look in ALL places: tables, lists, headers, body text, footers, summary sections
3. Extract EVERY product you see - if you see a product code/SKU and name, extract it
4. SKU/Product Code is the PRIMARY identifier - extract it EXACTLY as written (numbers, letters, dashes, etc.)
5. Product Name - extract EXACTLY as written in the document
6. If the same SKU appears with different names, extract BOTH as separate entries
7. If the same name appears with different SKUs, extract BOTH as separate entries  
8. If the same product (same SKU + same name) appears multiple times, extract ALL occurrences
9. Do NOT skip any products - better to extract too many than miss any
10. Pay special attention to:
    - Product codes/SKUs (usually numbers, may be in first column)
    - Product names (can be long, may have special characters)
    - Quantities (numbers, may be in quantity/stock/closing columns)
    - Any grouping or categorization`;

  // Vendor-specific instructions (will be customized later with user-provided formats)
  const vendorInstructions: Record<string, string> = {
    amazon: `${baseInstructions}

AMAZON-SPECIFIC INSTRUCTIONS (Excel Format):
The document is an Excel sheet with the following specific columns. Map them EXACTLY as follows:

1. SKU / Product Code:
   - SOURCE COLUMN: "ASIN" (Column D)
   - Extract the value from the 'ASIN' column.
   - Example values: B08G5QLVJ4, B08G5NGZVY

2. Product Name:
   - SOURCE COLUMN: "Title" (Column E)
   - Extract the full text from the 'Title' column.
   - Example: "Mother's Recipe Rice Papad Jeera Pouch, 75 Gram"

3. Quantity:
   - SOURCE COLUMN: "Quantity Outstanding" (Column G)
   - Extract the numeric value.

4. Price / Cost:
   - SOURCE COLUMN: "Unit Cost" (Column H)
   - Extract the numeric value.
   - Ignore "INR" or currency symbols.
   - Example: If cell is "18.57 INR", extract 18.57.

5. Description / Other:
   - Include the "PO" number (Column A) in the description or metadata if possible.
   - Brand Key: "Mother's Recipe" (often starts the Title)

CRITICAL:
- Row 1 is the header row. Start extracting from Row 2.
- Ignore rows where 'Quantity Outstanding' is 0 or empty.
- Proceed row by row ensuring data alignment.`,

    blinkit: `${baseInstructions}

BLINKIT-SPECIFIC INSTRUCTIONS:
- Extract product codes and variants
- Pay attention to weight/size variations in product names
- Check for multiple quantity columns
(More specific instructions will be added based on Blinkit document format)`,

    dmart: `${baseInstructions}

DMART-SPECIFIC INSTRUCTIONS (Purchase Order Format):
- Document Type: Purchase Order (PO)
- Look for the table with headers: Sno, EAN No, Article Description, UOM, Qty, Free, etc.

1. SKU / Product Code:
   - HEADER: "EAN No"
   - Extract the 13-digit EAN code.
   - Example: 8906001058151

2. Product Name:
   - HEADER: "Article Description"
   - Extract the full name.
   - CLEANUP: Remove [HSN Code: ...] from the end if present.
   - Example: "MOTHERS PUNJABI MASALA PAPAD(180G)"

3. Quantity:
   - HEADER: "Qty"
   - Extract the numeric quantity.
   - Example: 88

4. Price / Cost:
   - HEADER: "L.Price" (Landed Price)
   - Use "L.Price" as the unit cost.
   - Example: 39.15

5. Other Info:
   - Extract "PO #" from the document header (e.g., 4545204014) to use in metadata/description.
   - Ignore "Free" quantity column unless instructed otherwise (use "Qty" column).`,

    zepto: `${baseInstructions}

ZEPTO-SPECIFIC INSTRUCTIONS:
- Extract product IDs and variant information
- Look for pack size in product name
- Check delivery quantity columns
(More specific instructions will be added based on Zepto document format)`,

    swiggy: `${baseInstructions}

SWIGGY-SPECIFIC INSTRUCTIONS (Purchase Order Format):
- Document Type: Purchase Order (PO)
- Look for the table with headers: S.No, Item Code, Item Desc, HSN Code, Qty, MRP, Unit Base Cost, etc.

1. SKU / Product Code:
   - HEADER: "Item Code"
   - Extract the code.
   - Example: 210071

2. Product Name:
   - HEADER: "Item Desc"
   - Extract the full description text.
   - Note: It may contain multiple lines (Name, Colour, Size, Brand). Extract key product name or full description.
   - Example: "Mother's Recipe Lemon Ginger Squash 750.0 ml"

3. Quantity:
   - HEADER: "Qty"
   - Extract the numeric quantity.
   - Example: 12

4. Price / Cost:
   - HEADER: "Unit Base Cost (INR)" or "Unit Base Cost"
   - Extract the numeric value.
   - Example: 122.373

5. Other Info:
   - Extract "PO No :" from the document header (e.g., ETPPO03011).
   - "MRP" column is available if needed, but prefer "Unit Base Cost" for inventory value.`,

    eastern: `${baseInstructions}

EASTERN-SPECIFIC INSTRUCTIONS:
- Extract Eastern product codes
- Pay attention to product variants and packaging
- Look for batch or lot information if present
(More specific instructions will be added based on Eastern document format)`,

    default: baseInstructions
  };

  return vendorInstructions[vendor] || vendorInstructions.default;
}

/**
 * Use AI to extract product information from document text
 */
export async function extractProductsWithAI(
  filePath: string,
  mimetype: string,
  vendor: string = 'default'
): Promise<ExtractionResult> {
  try {
    // Extract text content from file
    const documentText = await extractTextFromFile(filePath, mimetype);

    if (!documentText || documentText.trim().length === 0) {
      throw new Error('No text content found in document');
    }

    // Truncate if too long (OpenAI has token limits)
    const maxLength = 50000; // Approximate character limit
    const truncatedText = documentText.length > maxLength
      ? documentText.substring(0, maxLength) + '\n... [truncated]'
      : documentText;

    // Get vendor-specific instructions
    const vendorPromptInstructions = getVendorSpecificPrompt(vendor);

    // Create AI prompt for extraction
    const prompt = `You are an expert data extraction assistant. Extract product information from the following ${vendor !== 'default' ? vendor.toUpperCase() : ''} document.

${vendorPromptInstructions}

Extract all products with the following information:
- SKU/Product Code (REQUIRED) - Extract EXACTLY as written, this is the most important field
- Product Name (REQUIRED) - Extract EXACTLY as written
- Brand (if available)
- Group/Category (if available)
- Quantity/Stock (REQUIRED if available) - Extract the exact number
- Price (if available)
- Description (if available)
- Any other relevant product information

Return the data as a JSON object with this structure:
{
  "products": [
    {
      "sku": "string (required - exact as in document)",
      "name": "string (required - exact as in document)",
      "brand": "string (optional)",
      "group": "string (optional)",
      "quantity": number (optional - exact number from document),
      "price": number (optional),
      "description": "string (optional)"
    }
  ],
  "metadata": {
    "documentType": "string",
    "totalItems": number,
    "date": "string (if found)"
  }
}

Document content:
${truncatedText}

Return ONLY valid JSON, no additional text or explanation.`;

    console.log(`\n=== AI Extraction for Vendor: ${vendor.toUpperCase()} ===\n`);

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert data extraction assistant specialized in reading inventory and stock documents.

CRITICAL EXTRACTION RULES:
1. Extract EVERY SINGLE product from the document - be COMPLETE and THOROUGH
2. SKU/Product Code is the PRIMARY identifier - extract it EXACTLY as written
3. Read the ENTIRE document carefully - check ALL tables, ALL rows, ALL sections
4. Do NOT skip any products - if you see a product code and name, extract it
5. Extract ALL occurrences - if same product appears multiple times, include all
6. Look for product codes in various formats: numbers, alphanumeric, with dashes
7. Product names may be long, have special characters, or abbreviations - extract exactly
8. Quantities are important - extract the exact numbers you see
9. Be thorough - scan every section, every table, every list
10. If unsure whether something is a product, extract it anyway - better to have extra than miss something
11. Always return valid JSON only - no explanations, no markdown, just JSON`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1, // Low temperature for consistent extraction
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';

    // Log AI response for debugging
    console.log('\n=== AI Extraction Response ===');
    console.log('Raw AI Response (first 2000 chars):', responseText.substring(0, 2000));
    if (responseText.length > 2000) {
      console.log('... (truncated, total length:', responseText.length, 'chars)');
    }

    const result = JSON.parse(responseText) as ExtractionResult;

    // Log parsed result
    console.log('\n=== Parsed Extraction Result ===');
    console.log('Total products extracted by AI:', result.products?.length || 0);
    if (result.products && result.products.length > 0) {
      console.log('\nAll extracted products:');
      result.products.forEach((p, idx) => {
        console.log(`  ${idx + 1}. SKU: "${p.sku}" | Name: "${p.name}" | Qty: ${p.quantity || 'N/A'} | Brand: ${p.brand || 'N/A'} | Group: ${p.group || 'N/A'}`);
      });
      console.log('\nSummary:');
      console.log(`  - Total products: ${result.products.length}`);
      const withQty = result.products.filter(p => p.quantity && p.quantity > 0).length;
      console.log(`  - Products with quantity: ${withQty}`);
      const uniqueSkus = new Set(result.products.map(p => p.sku)).size;
      console.log(`  - Unique SKUs: ${uniqueSkus}`);
      const uniqueNames = new Set(result.products.map(p => p.name)).size;
      console.log(`  - Unique Names: ${uniqueNames}`);
    }
    console.log('================================\n');

    // Validate and clean the extracted data
    if (!result.products || !Array.isArray(result.products)) {
      result.products = [];
    }

    // Clean and validate each product
    result.products = result.products
      .filter(p => p.sku && p.name) // Only keep products with required fields
      .map(p => ({
        sku: String(p.sku || '').trim(),
        name: String(p.name || '').trim(),
        brand: p.brand ? String(p.brand).trim() : undefined,
        group: p.group ? String(p.group).trim() : undefined,
        quantity: p.quantity ? Number(p.quantity) || 0 : undefined,
        price: p.price ? Number(p.price) || undefined : undefined,
        description: p.description ? String(p.description).trim() : undefined,
      }))
      .filter(p => p.sku && p.name); // Final validation

    return result;
  } catch (error: any) {
    throw new Error(`AI extraction failed: ${error.message}`);
  }
}

