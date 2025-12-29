
import * as XLSX from 'xlsx';
import { extractFromExcel } from '../lib/excel-extractor';
import { unlinkSync } from 'fs';

async function runTest() {
    console.log('=== Starting Excel Extraction Test ===');

    // 1. Create a mock Amazon PO
    const amazonData = [
        {
            "PO": "PO-12345",
            "Vendor": "TEST-VENDOR",
            "Ship to location": "Test Warehouse",
            "ASIN": "B00TEST001",
            "Title": "Test Product #1",
            "Quantity Outstanding": 10,
            "Unit Cost": 100,
            "Total cost": 1000
        },
        {
            "PO": "PO-12345",
            "Vendor": "TEST-VENDOR",
            "ASIN": "B00TEST002",
            "Title": "Test Product #2",
            "Quantity Outstanding": 5,
            "Unit Cost": 50,
            "Total cost": 250
        }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(amazonData);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const testFile = 'test_amazon.xlsx';
    XLSX.writeFile(wb, testFile);

    console.log(`Created test file: ${testFile}`);

    try {
        // 2. Run extraction
        console.log('Running extraction (vendor: amazon)...');
        const result = await extractFromExcel(testFile, 'amazon');

        // 3. Verify results
        console.log('Extraction complete. verifying results...');

        if (result.products.length !== 2) throw new Error(`Expected 2 products, got ${result.products.length}`);
        if (result.products[0].sku !== 'B00TEST001') throw new Error(`Expected SKU B00TEST001, got ${result.products[0].sku}`);
        if (result.products[0].quantity !== 10) throw new Error(`Expected Quantity 10, got ${result.products[0].quantity}`);
        if (result.rawDocumentInfo.documentNumber !== 'PO-12345') throw new Error(`Expected PO PO-12345, got ${result.rawDocumentInfo.documentNumber}`);

        console.log('✅ Amazon Test PASSED');

    } catch (err) {
        console.error('❌ Amazon Test FAILED:', err);
    } finally {
        try {
            unlinkSync(testFile);
            console.log('Cleaned up test file.');
        } catch (e) { }
    }
}

runTest();
