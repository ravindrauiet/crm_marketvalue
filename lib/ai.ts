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
  lineItemsSummary?: string;       // Summary of product line items
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
Amazon PO files are clean Excel spreadsheets. Extract ALL fields.

## EXCEL COLUMN STRUCTURE:
1. PO - Purchase Order ID (e.g., "8Q4RMHAU") -> poNumber
2. Vendor - Vendor code (e.g., "GLVSE") -> vendorCode
3. Ship to location - Warehouse address (e.g., "HNR4 - Dadri Toe, HARYANA") -> shipTo
4. ASIN - Amazon SKU (e.g., "B08G5QLVJ4") -> Use as SKU (10-char alphanumeric)
5. Title - Product name (e.g., "Mother's Recipe Rice Papad Jeera Pouch,75 Gram") -> name
6. Window end - Delivery date (e.g., "13/9/2025") -> deliveryDate
7. Quantity Outstanding - ORDER QUANTITY (e.g., 32, 88, 24) -> quantity
8. Unit Cost - Price per unit (e.g., 18.57, 58.5) -> price
9. (Currency) - Usually "INR"
10. Total cost - Line total (e.g., 594.24, 5148) -> totalCost
11. (Currency) - Usually "INR"

## HEADER (for rawDocumentInfo):
- poNumber: PO column value (same for all rows in a PO)
- vendorCode: Vendor column
- shipTo: Ship to location
- deliveryDate: Window end date

## EXTRACTION RULES:
- sku: ASIN (10-character code like "B08G5QLVJ4")
- name: Title (full product name)
- quantity: Quantity Outstanding (integer)
- price: Unit Cost (decimal)
- totalCost: Total cost (for validation)

## VALIDATION:
Total cost = Quantity Outstanding × Unit Cost
Example: 32 × 18.57 = 594.24 ✓

## BRAND DETECTION:
First words of Title are usually the brand:
- "Mother's Recipe" -> brand: "Mother's Recipe"
- "Eastern" -> brand: "Eastern"`,

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

    bigbasket: `${baseInstructions}

    BIGBASKET-SPECIFIC INSTRUCTIONS (Excel Format):
    1. HEADER INFO: The document starts with address blocks (Warehouse Address, Delivery Address). Extract these for "rawDocumentInfo".
    2. KEY FIELDS:
       - Warehouse Address -> Shipping Address
       - Delivery Address -> Billing Address / Buyer
       - GSTIN -> Vendor/Buyer GST
    3. PRODUCT TABLE:
       - Look for the main data table starting after row ~8-10.
       - EAN / UPC / Article Code: This is the product SKU. Often a 13-digit EAN or internal code.
       - Item Description / Product Name: Product Name.
       - PO Qty / Quantity: The ordered quantity.
       - MRP / Rate: Price information.
       - HSN Code: Tax classification code (extract if available).
    4. EXTRACTION STRATEGY:
       - Skip the top header blocks for product extraction.
       - Identify the main header row containing "Item", "Description", "Qty", "Amount".
       - Extract every row below that header as a product.
       - "rawDocumentInfo.vendorName" is likely "Innovative Retail Concepts Private Limited" or similar.`,

    dmart: `${baseInstructions}

DMART-SPECIFIC INSTRUCTIONS (PDF Format):
DMart POs have a consistent structure. Extract EVERYTHING.

## CRITICAL: QUANTITY EXTRACTION WITH VALIDATION
The PDF may concatenate Qty and Free (which is always 0). Use this validation method:

VALIDATION FORMULA: Qty ≈ T.Value ÷ L.Price

REAL EXAMPLES FROM DOCUMENT:
Row 1: T.Value=7,342.08, L.Price=15.30 → Qty = 7342.08÷15.30 = 480 ✓
Row 2: T.Value=7,342.08, L.Price=15.30 → Qty = 7342.08÷15.30 = 480 ✓
Row 3: T.Value=3,445.20, L.Price=39.15 → Qty = 3445.20÷39.15 = 88 ✓
Row 4: T.Value=3,825.00, L.Price=38.25 → Qty = 3825.00÷38.25 = 100 ✓

CORRECT QUANTITIES: 480, 480, 88, 100 (Total: 1148 - matches footer)

## COLUMN ORDER IN PDF:
Sno | EAN No | Article Description | UOM | Qty | Free | B.Price | Sp.Dis% | Sch.Val | SGST% | CGST% | Cess | L.Price | MRP | T.Value

## EXTRACTION RULES:
1. EAN No (13 digits starting 890) → sku
2. Article Description → name (REMOVE "[HSN Code:...]")
3. Qty → quantity (USE VALIDATION: T.Value ÷ L.Price)
4. Free → IGNORE (always 0)
5. L.Price → price
6. T.Value → totalValue (for validation)

## HEADER (for rawDocumentInfo):
- SHIP TO: Avenue Supermarts Ltd.
- VENDOR: GLOMIN OVERSEAS
- PO #, PO Date, Delivery Dt
- GSTIN numbers

## OUTPUT:
- sku: EAN (13 digits)
- name: Clean description (no HSN code)
- quantity: Validated qty (e.g., 480, 88, 100)
- price: L.Price value`,

    zepto: `${baseInstructions}

ZEPTO-SPECIFIC INSTRUCTIONS:
Zepto POs come in CSV and PDF formats. Extract ALL fields.

## CSV FORMAT (PREFERRED - VERY CLEAN DATA):
CSV columns in order:
1. PoNumber - PO number (e.g., "P2057888")
2. BatchID - Batch identifier
3. StoreName - Store location (e.g., "JJR-DRY-MH-LUHARI")
4. PoDate - PO date (YYYY-MM-DD HH:MM:SS)
5. Status - Order status
6. VendorCode - Vendor code (e.g., "KK-3798")
7. VendorName - Vendor name (e.g., "GLOMIN OVERSEAS-DELHI")
8. PoTotalAmount - Total PO amount
9. DeliveryLocation - Delivery location code
10. LineNumber - Line item number
11. Sku - SKU UUID (e.g., "1987446e-56f4-46cd-a223-c1a955190ba2") -> Use as SKU
12. MaterialCode - Internal code (e.g., "101446") -> Also useful as alternate SKU
13. SkuDesc - Product description (e.g., "Eastern Chilli Powder - 1 pack (100 g)") -> Use as Name
14. Brand - Brand name (e.g., "Eastern", "Mother's Recipe")
15. EAN - Barcode (13 digits starting 890)
16. HSN - HSN code for tax
17. CGSTPercentage, SGSTPercentage, IGSTPercentage, CESSPercentage - Tax rates
18. AbsoluteCess - Cess amount
19. MRP - Maximum retail price
20. Quantity - ORDER QUANTITY (e.g., 600, 320, 250)
21. UnitBaseCost - Base cost per unit
22. LandingCost - Final cost after taxes
23. TotalAmount - Line total

## PDF FORMAT:
PDF text often concatenates values. Key patterns:
- "1101446Eastern Chilli Powder" -> Split: MaterialCode="101446", Name="Eastern Chilli Powder..."
- First column is Sr. (row number) + MaterialCode concatenated
- Look for: Material Code | Item Description | SKU Code (UUID) | HSN | EAN | Quantity | MRP | Unit Base Cost | Taxable Value

## HEADER (for rawDocumentInfo):
- PO No: (e.g., "P2057888")
- PO Date: YYYY-MM-DD
- Vendor Name, GSTIN
- Expected Delivery Date
- PO Expiry Date
- Shipping Address (Zepto warehouse)

## EXTRACTION MAPPING:
- sku: Use MaterialCode (6 digits like "101446") or the UUID Sku
- name: SkuDesc / Item Description
- brand: Brand column
- quantity: Quantity column (integer like 600, 320, 250)
- price: UnitBaseCost or LandingCost
- mrp: MRP value
- ean: 13-digit EAN barcode
- totalAmount: TotalAmount for validation

## VALIDATION:
TotalAmount ≈ Quantity × LandingCost`,

    swiggy: `${baseInstructions}

SWIGGY-SPECIFIC INSTRUCTIONS:
Swiggy POs come in PDF and XLS formats via SCOOTSY LOGISTICS. Extract ALL fields.

## PDF FORMAT:
PDF text has headers split across lines and concatenated numbers.

HEADER (for rawDocumentInfo):
- PO No: (e.g., "ETPPO03012", "FC5PO242865")
- PO Date: (e.g., "Sep 16, 2025")
- Payment Terms, Expected Delivery Date, PO Expiry Date
- Vendor: "GLOMIN OVERSEAS-GURAGON" with GSTIN
- Shipping Address: SCOOTSY LOGISTICS PRIVATE LIMITED

PRODUCT TABLE COLUMNS:
1. S.No - Row number
2. Item Code - 4-6 digit code (e.g., "11531", "217762") -> Use as SKU
3. Item Desc - Product name (e.g., "Mtr Upma Breakfast Mix 160.0 g")
4. HSN Code - 8-digit HSN
5. Qty - ORDER QUANTITY (e.g., 120, 30, 40)
6. MRP - Maximum retail price
7. Unit Base Cost (INR) - Cost per unit
8. Taxable Value (INR) - Tax base amount
9. Tax columns (CGST, SGST, IGST, CESS)
10. Total (INR) - Line total

## CRITICAL: IGNORE METADATA
Product descriptions contain garbage text to IGNORE:
- "Colour: " (followed by blank or "size")
- "Size: size"
- "Brand:Top 800-1200" or "Brand:CAMPAIGN" or "Brand:Default"
REMOVE these when extracting the product name.

## VALIDATION:
Total ≈ TaxableValue × (1 + TaxRate)

## OUTPUT:
- sku: Item Code (4-6 digits)
- name: Clean Item Desc (without Colour/Size/Brand garbage)
- quantity: Qty column
- price: Unit Base Cost
- mrp: MRP`,

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
    const prompt = `You are an expert data extraction assistant.Extract ALL information from this ${vendor !== 'default' ? vendor.toUpperCase() : ''} document.

    ${vendorPromptInstructions}

## PART 1: DOCUMENT INFORMATION(FULL CONTENT)
  CRITICAL: This section must contain EVERY piece of information visible in the document.Do not skip anything.Even though you extract products in Part 2, you MUST also include them here in summary or text form so this section is a standalone complete record.

    Extract:
  - Document type(Invoice, Purchase Order, Stock Report, Delivery Note, etc.)
    - Document number(PO number, Invoice number, Reference number, etc.)
      - Document date
        - Vendor / Supplier details(name, address, phone, email, GST / Tax ID)
          - Buyer / Customer details(name, address, phone, email, GST / Tax ID)
            - Shipping address(if different)
    - Payment terms
      - Delivery / Due date
        - Subtotal, Tax, Total amounts
          - Currency
          - Any notes, terms, conditions
            - ALL product line items(include them in 'allVisibleText' or 'productSummaryText' if they don't fit specific fields)
              - Any other additional information visible

## PART 2: PRODUCT / ORDER LINE ITEMS
Extract all products / items with:
  - SKU / Product Code(REQUIRED) - Extract EXACTLY as written
    - Product Name(REQUIRED) - Extract EXACTLY as written
      - Brand(if available)
    - Group / Category(if available)
    - Quantity / Stock(REQUIRED if available)
    - Unit Price(if available)
    - Total Price(if available)
    - Description(if available)

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
                                              "lineItemsSummary": "string (textual list/summary of all products and quantities)",
                                                "allVisibleText": "string (summary of any other text not captured above)",
                                                  "additionalFields": { } // Any other key-value pairs found
    },
    "products": [
      {
        "sku": "string (required - exact as in document)",
        "name": "string (required - exact as in document)",
        "brand": "string (optional)",
        "group": "string (optional)",
        "quantity": number(optional),
        "price": number(optional - unit price),
        "totalPrice": number(optional - line total),
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

    console.log(`\n === AI Extraction for Vendor: ${vendor.toUpperCase()} ===\n`);

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert data extraction assistant specialized in reading inventory and stock documents.

CRITICAL EXTRACTION RULES:
  1. Extract EVERY SINGLE product from the document - be COMPLETE and THOROUGH
  2. SKU / Product Code is the PRIMARY identifier - extract it EXACTLY as written
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
        console.log(`  ${idx + 1}.SKU: "${p.sku}" | Name: "${p.name}" | Qty: ${p.quantity || 'N/A'} | Brand: ${p.brand || 'N/A'} | Group: ${p.group || 'N/A'} `);
      });
      console.log('\nSummary:');
      console.log(`  - Total products: ${result.products.length} `);
      const withQty = result.products.filter(p => p.quantity && p.quantity > 0).length;
      console.log(`  - Products with quantity: ${withQty} `);
      const uniqueSkus = new Set(result.products.map(p => p.sku)).size;
      console.log(`  - Unique SKUs: ${uniqueSkus} `);
      const uniqueNames = new Set(result.products.map(p => p.name)).size;
      console.log(`  - Unique Names: ${uniqueNames} `);
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
    throw new Error(`AI extraction failed: ${error.message} `);
  }
}

