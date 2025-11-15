import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

export function summarizeExcel(filePath: string) {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  const headers = (json[0] ?? []).map(String).slice(0, 12);
  const rows = (json.slice(1).slice(0, 20) as any[]).map(r => (r ?? []).slice(0, 12));
  return { headers, rows };
}








