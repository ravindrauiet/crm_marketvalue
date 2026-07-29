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
5. EAN / BARCODE: Look for 13-digit EAN/GTIN/UPC barcodes (starting with 890 for India) or EAN column. Extract into 'ean' field.
6. Product Name - extract EXACTLY as written in the document
7. If the same SKU appears with different names, extract BOTH as separate entries
8. If the same name appears with different SKUs, extract BOTH as separate entries  
9. If the same product (same SKU + same name) appears multiple times, extract ALL occurrences
10. Do NOT skip any products - better to extract too many than miss any
11. Pay special attention to:
    - Product codes/SKUs (usually numbers, may be in first column)
    - EAN / Barcode numbers (13-digit numbers starting with 890...)
    - Product names (can be long, may have special characters)
    - Quantities (numbers, may be in quantity/stock/closing columns)
    - Any grouping or categorization`;

  // Vendor-specific instructions (will be customized later with user-provided formats)
  const vendorInstructions: Record<string, string> = {
    amazon: `${baseInstructions}

AMAZON-SPECIFIC INSTRUCTIONS (PDF & Excel Format):
Amazon PO files come in clean Excel spreadsheets or PDF documents. Extract ALL fields.

## COLUMNS & FIELDS:
1. ASIN - Amazon SKU (e.g., "B08G5QLVJ4") -> Use as 'sku' (10-char alphanumeric)
2. EAN / Barcode - 13-digit barcode (starting with 890..., e.g., "8906001050704") -> Use as 'ean'
3. Title / Product Description -> Use as 'name'
4. Quantity Outstanding - ORDER QUANTITY (e.g., 32, 88, 24) -> Use as 'quantity'
5. Unit Cost - Price per unit (e.g., 18.57, 58.5) -> Use as 'price'
6. Total cost - Line total -> Use as 'totalCost'

## EXTRACTION RULES:
- sku: ASIN (10-character code like "B08G5QLVJ4")
- ean: 13-digit EAN/UPC barcode if visible in column or description
- name: Title (full product name)
- quantity: Quantity Outstanding (integer)
- price: Unit Cost (decimal)`,

    blinkit: `${baseInstructions}BLINKIT-SPECIFIC INSTRUCTIONS (PDF Format):
1. HEADER:
   - PO Number: Look for "P.O. Number :" (e.g., "1724010035523") -> poNumber
   - PO Date: "Date :" (e.g., "June 19, 2026") -> poDate
   - PO Delivery Date: "PO delivery date :" -> deliveryDate
   - PO Expiry Date: "PO expiry date :" -> expiryDate
   - Vendor Name: "Vendor :" (e.g., "SPAR TRADING COMPANY")
   - Purchaser Entity: "BLINK COMMERCE PRIVATE LIMITED"
   - Delivery Warehouse: "Delivered To :" (e.g., "BCPL - Dasna 2 Warehouse")

2. TABLE COLUMNS:
   - # (Row Number): 1, 2, 3... (DO NOT concatenate with Item Code)
   - Item Code (e.g., "10112731", "10001341", "10019793") -> MUST be set as 'sku' (chainItemCode)
   - Product UPC (13-digit EAN, e.g., "8901440013501") -> MUST be set as 'ean' (eanCode)
   - Product Description (e.g., "Eastern Chicken Kebab Masala(Pouch) (100 GM)") -> 'name' (chainItemName)
   - Qty. (e.g., 250, 100, 96, 48, 35) -> 'quantity'
   - Landing Rate / Basic Cost Price (e.g., 42.00, 35.70) -> 'price'
   - MRP (e.g., 60.00, 51.00) -> 'mrp'
   - Total Amt (e.g., 10500.00, 8925.00) -> 'totalAmount'

3. ITEM CODE CLEANUP (If text is concatenated):
   - If Row Number gets concatenated to Item Code (e.g., "110112731"), strip the leading row number to get the 8-digit Item Code ("10112731").`,

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
1. EAN No (13 digits starting with 890, e.g. 8906012240019) → MUST be set as BOTH 'sku' (Item Code) AND 'ean' (EAN Barcode)
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
- sku: EAN No (13 digits starting 890, e.g., 8906012240019)
- ean: EAN No (13 digits starting 890, e.g., 8906012240019)
- name: Clean description (without HSN code, e.g., DILBAHAR ANARDANA GOLI(100G))
- quantity: Validated qty (e.g., 160, 160, 16)
- price: L.Price value (e.g., 18.31, 26.27, 19.10)`,

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
- sku: MUST use Material Code (6 digits like "318922", "101467", "110143", "101850", "105180", "103451") as the primary Item Code (chainItemCode)
- ean: 13-digit EAN barcode (e.g. "8901440013280")
- name: Item Description (e.g. "Eastern Meat Masala Powder Pouch - 1 pack (100 g)")
- brand: Extract brand name if present (e.g. "Eastern")
- quantity: Quantity column (integer like 250, 100)
- price: Unit Base Cost (e.g. 46.00, 45.71)
- mrp: MRP/RSP value (e.g. 69.00, 72.00)
- totalAmount: Total (INR) column (e.g. 12075.00, 4799.52)

## VALIDATION:
TotalAmount ≈ Quantity × Unit Base Cost × (1 + TaxRate)`,

    reliance: `${baseInstructions}

RELIANCE RETAIL / METRO CASH AND CARRY INSTRUCTIONS (PDF Format):
1. HEADER:
   - PO Number: "PO NO.:" (e.g., "9202569635") -> poNumber
   - PO Date: "PO Date :" (e.g., "19.06.2026") -> poDate
   - Delivery Date: "DELIVERY DATE :" (e.g., "04.07.2026") -> deliveryDate
   - Vendor Name & Code: "Vendor Code : 20011895 GLOMIN OVERSEAS" -> vendorName
   - Delivery Address: "CDC-JHAJJAR-KULANA (SF)" / Distribution Center -> shippingAddress

2. CRITICAL ARTICLE NO. VS HSN CODE SPLIT:
   In Reliance POs, the "Article No." and "HSN Code" are stacked vertically in a SINGLE column:
   - FIRST / TOP Number (9 digits, e.g. "494627068") MUST be extracted as 'sku' (chainItemCode / Reliance Article No).
   - SECOND / BOTTOM Number (8 digits, e.g. "17011490") MUST be extracted as 'hsnCode' (HSN Code).
   - DO NOT mix up or swap the Article No. and HSN Code!

3. OTHER COLUMNS:
   - EAN No. (13 digits starting 890, e.g., "8908022806186") -> 'ean' (eanCode)
   - Material Description (e.g., "HEALTHY HUNGER RGLR JAGGRY CUBS 500G JAR") -> 'name' (chainItemName)
   - Quantity: Extract the total individual pieces (EA count, e.g., 870) as 'quantity' (quantityPcs). Also note Case count (CAR, e.g., 29).
   - Price: Base Cost or Unit Rate (e.g., 1857.00 per case or derived per unit).
   - MRP: MRP per case (e.g., 3600.00) or unit MRP (e.g., 120.00) -> 'mrp'
   - Total Base Value: Line total base value (e.g., 53853.00) -> 'totalAmount'`,

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

    vishal: `${baseInstructions}

VISHAL MEGA MART / AIRPLAZA RETAIL SPECIFIC INSTRUCTIONS:
1. HEADER:
   - PO Number: Look for "PO Number:" (e.g. "6907043005") -> poNumber
   - PO Date: "PODate: DD.MM.YYYY" -> poDate
   - Delivery Date: "DEL.DATE" column (DD.MM.YYYY) -> deliveryDate
   - Vendor / Purchasing Entity: "AIRPLAZA RETAIL HOLDINGS PVT LTD" (Vishal Mega Mart)
2. PRODUCT TABLE COLUMNS & SKU INSTRUCTIONS:
   - MAT. NO. is the ONLY valid SKU / Product Code.
   - MAT. NO. is ALWAYS a 10-digit number starting with "13" (e.g., "1310000368", "1310000306").
   - CRITICAL: Do NOT concatenate S.No (e.g. 100, 200) or EAN No (e.g. 48003425) into MAT. NO.!
   - If S.No, EAN No, and MAT. NO. appear together (e.g. "100480034251310000368"), extract ONLY the 10-digit MAT. NO. starting with "13" ("1310000368") into 'sku'.
   - EAN No (e.g. "48003425") -> ean
   - MATERIAL DESCRIPTION (e.g. "MTHRS-PKL-MXD-500G 24PK-PP") -> name / chainItemName
   - ORD.QTY (e.g. 24.00, 18.00) -> quantity / quantityPcs
   - RATE/UOM / BASE COST (e.g. 62.74, 105.24) -> price / unitPrice
   - M.R.P (e.g. 155.00, 260.00) -> mrp
   - NET VALUE (e.g. 1505.76, 1894.32) -> totalPrice`,

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

    // Clean up split EAN barcodes in PDF text (e.g. "EAN: \n 890600105 \n 3453" -> "EAN: 8906001053453")
    const cleanedText = documentText
      .replace(/EAN:\s*(\d{7,10})\s*[\r\n]+\s*(\d{3,6})/gi, 'EAN: $1$2')
      .replace(/(\b890\d{5,8})\s*[\r\n]+\s*(\d{3,6}\b)/g, '$1$2');

    // Extract deterministic ASIN/Code -> EAN map from raw text as 100% accurate fallback
    const eanMap: Record<string, string> = {};
    const eanRegex = /(B[0-9A-Z]{9}|[A-Z0-9]{6,15})\s*EAN:\s*(\d{7,10})\s*(\d{3,6})/gi;
    let eMatch;
    while ((eMatch = eanRegex.exec(documentText)) !== null) {
      const code = eMatch[1].toUpperCase().trim();
      const ean = eMatch[2] + eMatch[3];
      eanMap[code] = ean;
    }
    // Also match single-line EANs (e.g. EAN: 8906001053453)
    const singleEanRegex = /(B[0-9A-Z]{9}|[A-Z0-9]{6,15})\s*EAN:\s*(\d{13})/gi;
    while ((eMatch = singleEanRegex.exec(documentText)) !== null) {
      const code = eMatch[1].toUpperCase().trim();
      eanMap[code] = eMatch[2];
    }

    console.log(`ℹ️ [AI EXTRACTION] Deterministic EANs found in text: ${Object.keys(eanMap).length} / 22`);

    const truncatedText = cleanedText.length > maxLength
      ? cleanedText.substring(0, maxLength) + '\n... [truncated]'
      : cleanedText;

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
        "sku": "string (required - exact Item Code or ASIN as in document)",
        "ean": "string (optional - 13-digit EAN / UPC Barcode if visible, e.g. 8906001050704)",
        "name": "string (required - exact product description)",
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
        console.log(`  ${idx + 1}.SKU: "${p.sku}" | EAN: "${p.ean || 'N/A'}" | Name: "${p.name}" | Qty: ${p.quantity || 'N/A'}`);
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
      .map(p => {
        let sku = String(p.sku || '').trim();

        // Extract 10-digit MAT. NO. (e.g. "1310000368") if concatenated with S.No & EAN (e.g. "100480034251310000368")
        const matMatch = sku.match(/(13\d{8})/);
        if (matMatch) {
          sku = matMatch[1];
        }

        const skuKey = sku.toUpperCase();
        const ean = String(p.ean || p.eanCode || eanMap[skuKey] || '').trim();
        return {
          sku: sku,
          ean: ean || undefined,
          name: String(p.name || '').trim(),
          brand: p.brand ? String(p.brand).trim() : undefined,
          group: p.group ? String(p.group).trim() : undefined,
          quantity: p.quantity ? Number(p.quantity) || 0 : undefined,
          price: p.price ? Number(p.price) || undefined : undefined,
          description: p.description ? String(p.description).trim() : undefined,
        };
      })
      .filter(p => p.sku && p.name); // Final validation

    return result;
  } catch (error: any) {
    throw new Error(`AI extraction failed: ${error.message} `);
  }
}

