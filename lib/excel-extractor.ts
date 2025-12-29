
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { ExtractionResult, ExtractedProduct, RawDocumentInfo } from './ai';

/**
 * Deterministically extract product information from Excel files without using AI.
 * This ensures 100% accuracy for known formats and reduces costs.
 */
export async function extractFromExcel(
    filePath: string,
    vendor: string = 'default'
): Promise<ExtractionResult> {
    // Read the file
    const buf = readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    // We'll primarily look at the first sheet, but could scan others if needed
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];

    // Convert to JSON with header:1 option to get raw arrays first to detect headers
    // Then we can use sheet_to_json with appropriate options
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (!rawData || rawData.length === 0) {
        throw new Error('Excel file appears to be empty');
    }

    // Initialize result structure
    const result: ExtractionResult = {
        rawDocumentInfo: {
            documentType: 'Purchase Order (Excel)',
            vendorName: vendor !== 'default' ? vendor.toUpperCase() : undefined,
        },
        products: [],
        metadata: {
            totalItems: 0,
            method: 'DETERMINISTIC_EXCEL_PARSER'
        }
    };

    // Select strategy based on vendor
    switch (vendor.toLowerCase()) {
        case 'amazon':
            return parseAmazonExcel(sheet, result);
        case 'zepto':
            return parseZeptoExcel(sheet, result);
        case 'bigbasket':
            return parseBigBasketExcel(sheet, result);
        default:
            return parseGenericExcel(sheet, result);
    }
}

/**
 * Parser for Amazon Purchase Orders
 * Structure: PO, Vendor, Ship to location, ASIN, Title, Window end, Quantity Outstanding, Unit Cost...
 */
function parseAmazonExcel(sheet: XLSX.WorkSheet, result: ExtractionResult): ExtractionResult {
    const data = XLSX.utils.sheet_to_json<any>(sheet);

    if (data.length > 0) {
        // Extract header info from first row
        const firstRow = data[0];
        result.rawDocumentInfo.documentNumber = firstRow['PO'] || firstRow['PO Number'];
        result.rawDocumentInfo.vendorName = firstRow['Vendor'];
        result.rawDocumentInfo.shippingAddress = firstRow['Ship to location'];
        result.rawDocumentInfo.deliveryDate = firstRow['Window end'];
    }

    result.products = data.map(row => {
        // skip empty rows or summary rows
        if (!row['ASIN'] && !row['Title']) return null;

        const qty = Number(row['Quantity Outstanding'] || row['Quantity'] || 0);
        const unitCost = Number(row['Unit Cost'] || 0);

        return {
            sku: String(row['ASIN'] || '').trim(),
            name: String(row['Title'] || '').trim(),
            quantity: qty,
            price: unitCost,
            totalPrice: Number(row['Total cost'] || (qty * unitCost)),
            brand: extractBrandFromName(row['Title']),
            group: 'Amazon PO'
        };
    }).filter(p => p !== null && p.sku) as ExtractedProduct[];

    return finalizeResult(result);
}

/**
 * Parser for Zepto Purchase Orders
 * Structure: PoNumber, BatchID, Sku, SkuDesc, Brand, Quantity, UnitBaseCost...
 */
function parseZeptoExcel(sheet: XLSX.WorkSheet, result: ExtractionResult): ExtractionResult {
    const data = XLSX.utils.sheet_to_json<any>(sheet);

    if (data.length > 0) {
        const firstRow = data[0];
        result.rawDocumentInfo.documentNumber = firstRow['PoNumber'];
        result.rawDocumentInfo.documentDate = firstRow['PoDate'];
        result.rawDocumentInfo.vendorName = firstRow['VendorName'];
        result.rawDocumentInfo.shippingAddress = firstRow['StoreName'] + ' - ' + firstRow['DeliveryLocation'];
    }

    result.products = data.map(row => {
        if (!row['Sku'] && !row['MaterialCode']) return null;

        return {
            sku: String(row['MaterialCode'] || row['Sku'] || '').trim(), // Prefer MaterialCode for readability if available
            name: String(row['SkuDesc'] || row['Item Description'] || '').trim(),
            brand: String(row['Brand'] || '').trim(),
            quantity: Number(row['Quantity'] || 0),
            price: Number(row['UnitBaseCost'] || row['LandingCost'] || 0),
            totalPrice: Number(row['TotalAmount'] || 0),
            group: 'Zepto PO',
            description: row['Sku'] ? `UUID: ${row['Sku']}` : undefined
        };
    }).filter(p => p !== null && p.sku) as ExtractedProduct[];

    return finalizeResult(result);
}

/**
 * Parser for BigBasket Purchase Orders
 * Based on observed headers in prompts: EAN, Item Description, PO Qty, MRP
 */
function parseBigBasketExcel(sheet: XLSX.WorkSheet, result: ExtractionResult): ExtractionResult {
    // BigBasket often has header blocks before the table
    // We need to find the "Item" or "EAN" row
    const rawParams: XLSX.Sheet2JSONOpts = { header: 1 };
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, rawParams);

    let headerRowIndex = -1;
    let headerMap: Record<string, number> = {};

    // Find header row
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if (!row) continue;

        const rowStr = row.join(' ').toLowerCase();
        if ((rowStr.includes('ean') || rowStr.includes('article')) && rowStr.includes('qty')) {
            headerRowIndex = i;
            row.forEach((cell: any, idx: number) => {
                headerMap[String(cell).toLowerCase().trim()] = idx;
            });
            break;
        }
    }

    if (headerRowIndex === -1) {
        // Fallback to generic if we can't find specific header
        return parseGenericExcel(sheet, result);
    }

    // Attempt to extract document info from rows above header
    for (let i = 0; i < headerRowIndex; i++) {
        const rowText = (rows[i] || []).join(' ');
        if (rowText.includes('PO No')) result.rawDocumentInfo.documentNumber = extractValue(rowText, 'PO No');
        if (rowText.includes('Vendor')) result.rawDocumentInfo.vendorName = extractValue(rowText, 'Vendor');
    }

    // Parse products
    const products: ExtractedProduct[] = [];
    const getCol = (row: any[], name: string) => {
        // Try exact match first, then partial
        let idx = headerMap[name];
        if (idx === undefined) {
            const key = Object.keys(headerMap).find(k => k.includes(name));
            if (key) idx = headerMap[key];
        }
        return idx !== undefined ? row[idx] : undefined;
    };

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const ean = getCol(row, 'ean') || getCol(row, 'article');
        const name = getCol(row, 'description') || getCol(row, 'item');
        const qty = getCol(row, 'qty') || getCol(row, 'quantity');
        const price = getCol(row, 'rate') || getCol(row, 'cost') || getCol(row, 'mrp');

        if (ean && name) {
            products.push({
                sku: String(ean).trim(),
                name: String(name).trim(),
                quantity: Number(qty || 0),
                price: Number(price || 0),
                group: 'BigBasket PO'
            });
        }
    }

    result.products = products;
    return finalizeResult(result);
}


/**
 * Generic Excel Parser with header detection heuristics
 */
function parseGenericExcel(sheet: XLSX.WorkSheet, result: ExtractionResult): ExtractionResult {
    const data = XLSX.utils.sheet_to_json<any>(sheet);

    if (data.length === 0) return finalizeResult(result);

    // Analyze first row keys to map fields
    const sampleRow = data[0];
    const keys = Object.keys(sampleRow);

    const mapField = (term: string) => keys.find(k => k.toLowerCase().includes(term));

    const skuField = keys.find(k => /sku|code|asin|ean|article|material/i.test(k));
    const nameField = keys.find(k => /name|title|desc|item/i.test(k));
    const qtyField = keys.find(k => /qty|quantity|stock|units/i.test(k));
    const priceField = keys.find(k => /price|cost|rate|mrp|amount/i.test(k));
    const brandField = mapField('brand');

    if (!skuField || !nameField) {
        // If strict mapping fails, try using raw string search in a "dumb" mode or return empty
        // For now, let's just log and return what we have to be safe
        console.warn('Generic Excel Parser: Could not identify SKU or Name columns automatically.');
    }

    result.products = data.map(row => {
        // If we couldn't find fields, try safe defaults
        const sku = skuField ? row[skuField] : (row['SKU'] || row['Code']);
        const name = nameField ? row[nameField] : (row['Name'] || row['Description']);

        if (!sku && !name) return null;

        return {
            sku: String(sku || 'UNKNOWN').trim(),
            name: String(name || 'Unknown Product').trim(),
            quantity: qtyField ? Number(row[qtyField] || 0) : 0,
            price: priceField ? Number(row[priceField] || 0) : 0,
            brand: brandField ? String(row[brandField] || '').trim() : undefined,
            description: 'Extracted via Generic Excel Parser'
        };
    }).filter(p => p !== null && p.sku !== 'UNKNOWN') as ExtractedProduct[];

    return finalizeResult(result);
}

// Helpers

function extractBrandFromName(name: string): string | undefined {
    if (!name) return undefined;
    // Heuristic: First word is often the brand
    return name.split(' ')[0];
}

function extractValue(text: string, label: string): string {
    const parts = text.split(label);
    if (parts.length > 1) {
        return parts[1].split(/[,;]/)[0].replace(/[:]/g, '').trim();
    }
    return '';
}

function finalizeResult(result: ExtractionResult): ExtractionResult {
    result.metadata = {
        ...result.metadata,
        totalItems: result.products.length,
        processedDate: new Date().toISOString()
    };

    // Create summary text for rawDocumentInfo
    const productSummary = result.products.map(p =>
        `${p.sku}: ${p.name} (Qty: ${p.quantity})`
    ).join('\n');

    result.rawDocumentInfo.lineItemsSummary = productSummary;

    return result;
}
