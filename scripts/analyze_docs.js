
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');

// Configuration: Samples to analyze
const SAMPLES = [
    { vendor: 'DMart', file: 'MOTHERS  PO_dmart.pdf' },
    { vendor: 'DMart', file: 'MOTHERS PAPAD PO_dmart.pdf' },
    { vendor: 'DMart', file: 'MOTHERS po_dmart.pdf' }
];

const BASE_DIR = path.join(__dirname, '../../PO automation');
const OUTPUT_FILE = path.join(__dirname, 'analysis_output.txt');

function log(msg) {
    fs.appendFileSync(OUTPUT_FILE, msg + '\n');
}

async function analyze() {
    fs.writeFileSync(OUTPUT_FILE, 'Starting analysis of sample documents...\n');

    for (const sample of SAMPLES) {
        const filePath = path.join(BASE_DIR, sample.file);
        log(`\n--------------------------------------------------`);
        log(`ANALYZING: ${sample.vendor} (${sample.file})`);
        log(`--------------------------------------------------`);

        if (!fs.existsSync(filePath)) {
            log(`ERROR: File not found at ${filePath}`);
            continue;
        }

        try {
            if (sample.file.endsWith('.pdf')) {
                const dataBuffer = fs.readFileSync(filePath);
                const data = await pdf(dataBuffer);
                log('--- EXTRACTED PDF TEXT (First 1500 chars) ---');
                log(data.text.substring(0, 1500));
                log('\n--- END TEXT SAMPLE ---');
            } else if (sample.file.endsWith('.xlsx') || sample.file.endsWith('.xls')) {
                const buf = fs.readFileSync(filePath);
                const wb = XLSX.read(buf, { type: 'buffer' });
                const sheetName = wb.SheetNames[0];
                const sheet = wb.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays to see headers

                log('--- EXTRACTED EXCEL DATA (First 10 rows) ---');
                log(JSON.stringify(json.slice(0, 10), null, 2));
                log('\n--- END EXCEL SAMPLE ---');
            }
        } catch (err) {
            log(`ERROR processing file: ${err.message}`);
        }
    }
    log('\nAnalysis Complete.');
}

analyze();
