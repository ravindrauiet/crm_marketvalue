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

// Type for comprehensive document information
export type RawDocumentInfo = {
  documentType?: string;           // Invoice, Purchase Order, Stock Report, etc.
  documentNumber?: string;         // PO number, Invoice number, etc.
  documentDate?: string;           // Date on the document
  vendorName?: string;             // Vendor/Supplier name
  vendorAddress?: string;          // Vendor address
  vendorContact?: string;          // Phone, email, etc.
  vendorGST?: string;              // GST/Tax ID
  buyerName?: string;              // Buyer/Customer name
  buyerAddress?: string;           // Buyer address
  buyerContact?: string;           // Buyer phone, email
  buyerGST?: string;               // Buyer GST/Tax ID
  shippingAddress?: string;        // Delivery address
  paymentTerms?: string;           // Payment terms
  deliveryDate?: string;           // Expected delivery date
  subtotal?: number;               // Subtotal amount
  taxAmount?: number;              // Tax amount
  totalAmount?: number;            // Total amount
  currency?: string;               // Currency (INR, USD, etc.)
  notes?: string;                  // Any additional notes
  terms?: string;                  // Terms and conditions
  allVisibleText?: string;         // Summary of all other visible text
  additionalFields?: Record<string, any>; // Any other fields found
};

export type ExtractionResult = {
  rawDocumentInfo: RawDocumentInfo; // ALL information visible in the document
  products: ExtractedProduct[];      // Structured product/order line items
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
The text provided is a JSON extraction of an Excel file.
1. ROW STRUCTURE: Look for arrays where index 3 (Column D) is an alphanumeric code valid as ASIN (e.g., B08G5QLVJ4).
2. COLUMNS TO EXTRACT:
   - SKU/ASIN: Index 3 (Column D)
   - Name: Index 4 (Column E) - Extract full title.
   - Quantity: Index 6 (Column G) - This is "Quantity Outstanding". Only extract if > 0.
   - Cost: Index 7 (Column H) - "Unit Cost".
3. IGNORE: Rows where "Quantity Outstanding" is 0 or missing.
4. BRAND: Usually the first 1-2 words of the Name (e.g., "Mother's Recipe").`,

    blinkit: `${baseInstructions}

BLINKIT-SPECIFIC INSTRUCTIONS (PDF Format):
The text often has messy vertical formatting where the Row Number (S.No) gets stuck to the Item Code.
1. SKU/ITEM CODE CLEANUP (CRITICAL):
   - You might see "1100028", "2101970", "10101119".
   - This pattern is [Row Number] + [Item Code].
   - Row 1: "1100028" -> Split "1" and "100028". SKU is "100028".
   - Row 2: "2101970" -> Split "2" and "101970". SKU is "101970".
   - Row 10: "10101119" -> Split "10" and "101119". SKU is "101119".
   - ALWAYS remove the leading integer if it matches the sequential row count. The separate SKU is usually 6-7 digits.
2. QUANTITY (CRITICAL):
   - Do NOT assume quantity is "24" for all items.
   - Look for the specific integer column usually labelled "O/S Qty", "PO Qty", or appearing after the Product Description.
   - Ensure each row has its own unique quantity.
3. NAME PATTERN: "Brand + Product + Weight" (e.g., "Mother's Recipe Appalam Papad (100 g)").
4. UPC/EAN: Extract '890...' numbers if present as secondary identifiers.
5. EXTRACTION STRATEGY:
   - Identify the Row Start (1, 2, 3...).
   - Extract the SKU immediately following it.
   - Extract the Name.
   - Extract the specific Quantity for THAT row.`,

    dmart: `${baseInstructions}

DMART-SPECIFIC INSTRUCTIONS (PDF Format):
This document is usually a clean table.
1. RECORD MARKER: Lines starting with a small integer or "EAN No" are the best indicators.
2. KEY IDENTIFIER (EAN): Look for a 13-digit number starting with '890' (e.g., "8906001051602"). Use this as the SKU.
3. NAME PATTERN: Text immediately following the EAN (e.g., "MOTHERS PATATO PAPAD-70G").
4. CLEANUP: Remove "[HSN Code: ...]" from the Name if it's attached.
5. QUANTITY: Look for the large integer following "EA" or "CS" (e.g., "EA 4800"). This is the most critical extraction.
6. COST: "L.Price" value usually appears near the end of the line (e.g. "15.30").`,

    zepto: `${baseInstructions}

ZEPTO-SPECIFIC INSTRUCTIONS (PDF Format):
The text often runs together (e.g., "1101446Eastern").
1. SPLITTING REQUIRED: If you see a numeric code immediately followed by text (e.g., "1101446Eastern"), SPLIT IT.
   - SKU/Material Code: "1101446"
   - Name: "Eastern Chilli Powder..."
2. IDENTIFIERS:
   - Material Code (7 digits) is the primary internal SKU.
   - EAN (13 digits, starting 890) might be present later in the text block.
3. QUANTITY: Look for the quantity number. It might be mentioned as "1 pack" in description, but look for the tabular quantity column value (e.g., "160" or "40.00").
4. EXTRACTION: Prioritize separating the leading ID from the Name.`,

    swiggy: `${baseInstructions}

SWIGGY-SPECIFIC INSTRUCTIONS (PDF Format):
1. ITEM CODE: 5-7 digit number (e.g., "11531" or "217762") usually at the start of a logical row.
2. NAME PATTERN: Follows the code. (e.g. "Mtr Upma Breakfast Mix 160.0 g").
3. QUANTITY: Integer value appearing after the name and HSN.
4. COST: "Unit Base Cost" (e.g. "41.18") usually appears after MRP.
5. SPECIAL CASE: "Colour: Size: size" - Ignore this generic metadata.`,

    eastern: `${baseInstructions}
EASTERN-SPECIFIC INSTRUCTIONS:
1. Look for Eastern's specific product codes (often 4-6 digits).
2. Product names usually start with "Eastern".
3. Extract batch numbers if clearly labeled.
4. Standard table extraction rules apply: Code -> Name -> Quantity.`,

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

    // Create AI prompt for extraction - TWO PARTS: Document Info + Products
    const prompt = `You are an expert data extraction assistant. Extract ALL information from this ${vendor !== 'default' ? vendor.toUpperCase() : ''} document.

${vendorPromptInstructions}

## PART 1: DOCUMENT INFORMATION
Extract ALL visible information from the document header, footer, and body:
- Document type (Invoice, Purchase Order, Stock Report, Delivery Note, etc.)
- Document number (PO number, Invoice number, Reference number, etc.)
- Document date
- Vendor/Supplier details (name, address, phone, email, GST/Tax ID)
- Buyer/Customer details (name, address, phone, email, GST/Tax ID)
- Shipping address (if different)
- Payment terms
- Delivery/Due date
- Subtotal, Tax, Total amounts
- Currency
- Any notes, terms, or additional information visible

## PART 2: PRODUCT/ORDER LINE ITEMS
Extract all products/items with:
- SKU/Product Code (REQUIRED) - Extract EXACTLY as written
- Product Name (REQUIRED) - Extract EXACTLY as written
- Brand (if available)
- Group/Category (if available)
- Quantity/Stock (REQUIRED if available)
- Unit Price (if available)
- Total Price (if available)
- Description (if available)

Return the data as a JSON object with this structure:
{
  "rawDocumentInfo": {
    "documentType": "string (Invoice/PO/Stock Report/etc.)",
    "documentNumber": "string (exact document number)",
    "documentDate": "string (date as shown)",
    "vendorName": "string",
    "vendorAddress": "string",
    "vendorContact": "string (phone/email)",
    "vendorGST": "string (GST/Tax ID)",
    "buyerName": "string",
    "buyerAddress": "string",
    "buyerContact": "string",
    "buyerGST": "string",
    "shippingAddress": "string",
    "paymentTerms": "string",
    "deliveryDate": "string",
    "subtotal": number,
    "taxAmount": number,
    "totalAmount": number,
    "currency": "string (INR/USD/etc.)",
    "notes": "string (any notes or remarks)",
    "terms": "string (terms and conditions)",
    "allVisibleText": "string (summary of any other text not captured above)",
    "additionalFields": {} // Any other key-value pairs found
  },
  "products": [
    {
      "sku": "string (required - exact as in document)",
      "name": "string (required - exact as in document)",
      "brand": "string (optional)",
      "group": "string (optional)",
      "quantity": number (optional),
      "price": number (optional - unit price),
      "totalPrice": number (optional - line total),
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

