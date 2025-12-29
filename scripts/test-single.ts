
console.log('Simple Test Starting...');
try {
    const xlsx = require('xlsx');
    console.log('XLSX loaded:', !!xlsx);
} catch (e) {
    console.error('Error loading xlsx:', e);
}
console.log('Simple Test Done');
