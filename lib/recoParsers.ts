// Deterministic parser for payment ledgers / remittance advices in Excel or CSV form
// (Flipkart vendor ledger, Amazon remittance pasted as tab-separated text, Tally ledgers,
// bank statements). Reads every row quickly — no AI — so large ledgers don't time out.

import * as XLSX from 'xlsx';
import { parseDate, toNumber } from './validation';

export type RecoRow = {
  txnDate: Date | null;
  narration: string;
  creditAmount: number;
  debitAmount: number;
  balance: number;
  bankRef: string;
  invoiceNumber: string;
  poNumber: string;
  deductionReason: string;
};

const clean = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
  return s === '-' || s === '--' ? '' : s;
};

const SYNONYMS = {
  invoice: ['vendor invoice id', 'invoice number', 'invoice no', 'invoice no.', 'inv no', 'bill no', 'invoice', 'ref doc no', 'vch no', 'voucher no', 'reference no'],
  // Ledgers with one signed amount column plus a type column (e.g. Zepto: INVOICE / PAYMENT / DEBIT_NOTE_…)
  signed: ['amount', 'amount (inr)', 'amount in inr', 'amt'],
  type: ['type/description', 'transaction type', 'document type', 'doc type', 'type', 'vch type'],
  po: ['po id', 'po number', 'po no', 'po #', 'purchase order', 'po', 'order no'],
  invoiceAmount: ['invoice amount', 'invoice amt', 'gross amount', 'bill amount'],
  paid: ['payment amount', 'amount paid', 'paid amount', 'net amount', 'net paid', 'credit', 'credit amount', 'deposit', 'deposits', 'cr'],
  deduction: ['deduction amount', 'discount taken', 'deduction', 'tds amount', 'tds', 'debit', 'debit amount', 'withdrawal', 'withdrawals', 'dr'],
  reason: ['deduction reason', 'invoice description', 'description', 'narration', 'particulars', 'remarks', 'remark', 'reason', 'details'],
  date: ['paid date', 'payment date', 'value date', 'txn date', 'transaction date', 'posting date', 'date', 'invoice date'],
  ref: ['utr', 'utr no', 'oracle payment doc number', 'payment doc', 'payment reference', 'reference no', 'ref no', 'cheque no', 'chq no', 'txn ref'],
  balance: ['balance', 'closing balance', 'amount remaining', 'remaining amount (oracle)', 'remaining amount'],
};

/** Split rows where a whole tab-separated line was pasted into one cell */
function expandTabRows(rows: any[][]): string[][] {
  return rows.map(r => {
    const cells = (r || []).map(c => (c === null || c === undefined ? '' : String(c)));
    const filled = cells.filter(c => c.trim() !== '');
    if (filled.length === 1 && filled[0].includes('\t')) return filled[0].split('\t').map(c => c.trim());
    return cells.map(c => c.trim());
  });
}

function findHeader(rows: string[][]): number {
  let best = -1; let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map(c => c.toLowerCase());
    let score = 0;
    for (const syns of Object.values(SYNONYMS)) {
      if (cells.some(c => c && syns.some(s => c === s || (s.length > 3 && c.includes(s))))) score++;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 3 ? best : -1;
}

/** PO number hidden in a description, e.g. Amazon "3R6B7J1Z/HNR4/##YES" or a Flipkart PO id */
function poFromText(text: string): string {
  const amazon = text.match(/^([A-Z0-9]{8})\/[A-Z0-9]{3,5}\//);
  if (amazon) return amazon[1];
  const fk = text.match(/\b(F[A-Z]{3,5}\d{8,})\b/);
  if (fk) return fk[1];
  const po = text.match(/\bPO\s*[:#-]?\s*([A-Z0-9-]{6,})/i);
  return po ? po[1] : '';
}

export type ParsedRecoSheet = { rows: RecoRow[]; headerText: string; columns: Record<string, string> };

/** Returns null when the sheet does not look like a ledger / statement table */
export function parseRecoSpreadsheet(buf: Buffer): ParsedRecoSheet | null {
  // Excel files are zip (PK) or OLE (D0 CF); anything else is CSV / pasted text and is read as
  // plain strings — otherwise the library re-interprets "2026-09-05" style dates and swaps day/month
  const isBinary = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
  const wb = isBinary
    ? XLSX.read(buf, { type: 'buffer', cellDates: true })
    : XLSX.read(buf.toString('utf8').replace(/^﻿/, ''), { type: 'string', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = expandTabRows(XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' }));
  const h = findHeader(rows);
  if (h === -1) return null;

  const header = rows[h].map(c => c.toLowerCase());
  const used = new Set<number>();
  const col = (key: keyof typeof SYNONYMS) => {
    for (const s of SYNONYMS[key]) {
      const i = header.findIndex((c, idx) => !used.has(idx) && c === s);
      if (i !== -1) { used.add(i); return i; }
    }
    for (const s of SYNONYMS[key]) {
      if (s.length <= 3) continue; // short tokens (po, cr, dr) only as exact matches
      const i = header.findIndex((c, idx) => !used.has(idx) && c.includes(s));
      if (i !== -1) { used.add(i); return i; }
    }
    return -1;
  };
  // Order matters: specific columns first so generic words don't steal them
  const c = {
    invoiceAmount: col('invoiceAmount'),
    paid: col('paid'),
    deduction: col('deduction'),
    invoice: col('invoice'),
    po: col('po'),
    // before 'reason', so "Type/Description" is the line type (not taken as a description)
    type: col('type'),
    reason: col('reason'),
    ref: col('ref'),
    balance: col('balance'),
    date: col('date'),
    date2: col('date'),   // second date column (e.g. invoice date) used when the first is empty
    signed: col('signed'),
  };
  const signedMode = c.paid === -1 && c.deduction === -1 && c.invoiceAmount === -1 && c.signed >= 0;
  if (c.paid === -1 && c.deduction === -1 && c.invoiceAmount === -1 && !signedMode) return null;

  // Default reference for advices that print it once above the table ("Payment number: 370964663")
  const preamble = rows.slice(0, h).map(r => r.join(' ')).join(' ');
  const defaultRef = (preamble.match(/payment\s*(?:number|no\.?|ref(?:erence)?)\s*:?\s*\[?"?([A-Z0-9/-]{5,})/i) || [])[1] || '';
  // Bank / Tally 'Debit' columns are invoices or withdrawals, not chain deductions
  const debitIsDeduction = c.deduction >= 0 && !/^(debit|dr|debit amount|withdrawal|withdrawals)$/.test(header[c.deduction]);

  const out: RecoRow[] = [];
  let lastInvoice = ''; let lastDate: Date | null = null;
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => !v)) continue;
    const joined = row.join(' ').toLowerCase();
    if (/^\s*(grand\s*)?total\b/.test(joined) || /closing balance|opening balance/.test(joined)) continue;

    const get = (i: number) => (i >= 0 ? clean(row[i]) : '');
    let credit = toNumber(get(c.paid)) ?? 0;
    let debit = Math.abs(toNumber(get(c.deduction)) ?? 0);
    // Negative payment lines (TDS / credit memos in Amazon remittances) are deductions
    if (credit < 0) { debit += Math.abs(credit); credit = 0; }
    const invoiceAmount = toNumber(get(c.invoiceAmount)) ?? 0;
    const typeText = get(c.type);
    let isDeductionLine = false;

    if (signedMode) {
      // Classify by the line type: payments received, deductions (debit notes, TDS, claims), invoices
      const amt = toNumber(get(c.signed)) ?? 0;
      if (/opening|closing/i.test(typeText)) continue;
      if (/payment|receipt/i.test(typeText)) { if (amt >= 0) credit = amt; else debit = -amt; }
      else if (/debit.?note|deduct|tds|claim|shortage|penalty|discount|chargeback|commission|fee|return/i.test(typeText)) { debit = Math.abs(amt); isDeductionLine = true; }
      // An invoice is an amount billed (debit, like Tally ledgers) — not a deduction
      else if (/invoice|bill|sale/i.test(typeText)) debit = Math.abs(amt);
      else if (amt >= 0) credit = amt; else debit = -amt;
    }
    if (credit === 0 && debit === 0 && invoiceAmount === 0) continue;

    // Tally ledgers put 'To' / 'By' under Particulars and the account name in the next column
    let reason = get(c.reason) || (signedMode ? [typeText.replace(/_/g, ' '), get(c.reason)].filter(Boolean).join(' ') : '');
    if (/^(to|by)$/i.test(reason) && c.reason >= 0) reason = [reason, clean(row[c.reason + 1])].filter(Boolean).join(' ');
    const invoiceNumber = get(c.invoice);
    const poNumber = (get(c.po) || poFromText(reason)).replace(/^PO\s*#\s*/i, '');
    // Deduction / TDS lines often have no date: use the second date column, else the date of the
    // line above when it belongs to the same invoice
    let txnDate = parseDate(get(c.date)) || parseDate(get(c.date2));
    if (!txnDate && invoiceNumber && invoiceNumber === lastInvoice) txnDate = lastDate;
    if (invoiceNumber) { lastInvoice = invoiceNumber; if (txnDate) lastDate = txnDate; }
    out.push({
      txnDate,
      narration: reason || (invoiceNumber ? `Invoice ${invoiceNumber}` : 'Ledger entry'),
      creditAmount: credit,
      debitAmount: debit,
      balance: toNumber(get(c.balance)) ?? 0,
      bankRef: get(c.ref) || defaultRef,
      invoiceNumber,
      poNumber,
      deductionReason: debit > 0 && (isDeductionLine || (!signedMode && debitIsDeduction)) ? reason : '',
    });
  }

  // Includes the column header row, which identifies some formats (e.g. Amazon remittances)
  const headerText = rows.slice(0, h + 1).map(r => r.join(' ')).join(' ');
  const columns = Object.fromEntries(Object.entries(c).map(([k, i]) => [k, i >= 0 ? rows[h][i] : '']));
  return { rows: out, headerText, columns };
}

/** Retail chain from the file name / document text. Bank names in UTRs ("HSBCN…") are ignored. */
export function detectRecoChain(fileName: string, text: string, hint = 'OTHER'): string {
  if (hint && hint !== 'OTHER' && hint !== 'AUTO') return hint;
  const s = `${fileName} ${text}`.toUpperCase();
  if (/AMAZON/.test(s)) return 'AMAZON';
  if (/FLIPKART/.test(s)) return 'FLIPKART';
  if (/ZEPTO|KIRANAKART|GEDDIT/.test(s)) return 'ZEPTO';
  if (/SWIGGY|SCOOTSY|INSTAMART/.test(s)) return 'SWIGGY';
  if (/BLINKIT|BLINK COMMERCE|GROFERS/.test(s)) return 'BLINKIT';
  if (/BIGBASKET|BIG BASKET|INNOVATIVE RETAIL|SUPERMARKET GROCERY SUPPLIES/.test(s)) return 'BIGBASKET';
  if (/RELIANCE/.test(s)) return 'RELIANCE';
  if (/DMART|AVENUE SUPERMARTS/.test(s)) return 'DMART';
  if (/CITYMALL/.test(s)) return 'CITYMALL';
  // Amazon remittance layout / Amazon FC-coded descriptions ("57L2ABKV/HNR4/##YES")
  if (/DISCOUNT TAKEN[\s\S]{0,40}AMOUNT PAID|SUPPLIER SITE NAME|\b[A-Z0-9]{8}\/[A-Z]{3,4}\d\/#/.test(s)) return 'AMAZON';
  if (/\bHSBC\b(?!N)/.test(fileName.toUpperCase())) return 'HSBC';
  return 'OTHER';
}
