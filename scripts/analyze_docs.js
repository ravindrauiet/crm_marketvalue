
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');

// Configuration: Samples to analyze
const SAMPLES = [
    { vendor: 'Amazon', file: "Amazon po's 29.08.2025.xlsx" }
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
                log('--- EXTRACTED PDF TEXT (First 2000 chars) ---');
                log(data.text.substring(0, 2000));
                log('\n--- END TEXT SAMPLE ---');
            } else if (sample.file.endsWith('.csv')) {
                const csvContent = fs.readFileSync(filePath, 'utf-8');
                const lines = csvContent.split('\n').slice(0, 15);
                log('--- EXTRACTED CSV DATA (First 15 rows) ---');
                log(lines.join('\n'));
                log('\n--- END CSV SAMPLE ---');
            } else if (sample.file.endsWith('.xlsx') || sample.file.endsWith('.xls')) {
                const buf = fs.readFileSync(filePath);
                const wb = XLSX.read(buf, { type: 'buffer' });
                const sheetName = wb.SheetNames[0];
                const sheet = wb.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

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
