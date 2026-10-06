import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';

export class ValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Standard error response: ValidationError -> its status, anything else -> 500 */
export function errorResponse(err: any, prefix = 'Request failed') {
  if (err instanceof ValidationError) return badRequest(err.message, err.status);
  return NextResponse.json({ error: `${prefix}: ${err?.message || err}` }, { status: 500 });
}

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
export function isObjectId(v: unknown): v is string {
  return typeof v === 'string' && OBJECT_ID_RE.test(v);
}

/**
 * Parses numbers from user / Excel input: "1,200.50", "₹ 500", "120 pcs", 42.
 * Returns null for empty or non-numeric input (never NaN).
 */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
  const cleaned = s.replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function utcDate(y: number, m: number, d: number): Date | null {
  if (y < 100) y += 2000;
  if (m < 0 || m > 11 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m, d));
  // Reject overflow like 31/02
  if (dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return dt;
}

/**
 * Parses dates the way Indian business documents write them.
 * Supports: Date objects, Excel serial numbers, YYYY-MM-DD (with optional time),
 * DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (2 or 4 digit year), 1-Jul-26, 23 Aug 2026, Aug 23, 2026.
 * Day-first is assumed for numeric dates. Returns null when the value is not a valid date
 * (never silently substitutes today's date).
 */
export function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) {
      const p = XLSX.SSF.parse_date_code(v);
      if (p) return utcDate(p.y, p.m - 1, p.d);
    }
    return null;
  }

  // A trailing clock time ("01/04/2026 00:00", "28/03/2026 05:30:00 PM") does not change the date
  const s = String(v).trim().replace(/^(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?$/i, '$1');
  if (!s) return null;

  // ISO: 2026-08-23 or 2026-08-23T10:00:00Z
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) {
    // Time / timezone parts (e.g. 2025-04-28T00:00:00+05:30) are ignored: the calendar date is what matters
    return utcDate(+m[1], +m[2] - 1, +m[3]);
  }

  // YYYY/MM/DD
  m = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
  if (m) return utcDate(+m[1], +m[2] - 1, +m[3]);

  // DD/MM/YYYY, DD-MM-YY, DD.MM.YYYY (day first)
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    // If the second part can't be a month, the document is month-first
    if (b > 12 && a <= 12) return utcDate(y, a - 1, b);
    return utcDate(y, b - 1, a);
  }

  // 1-Jul-26, 23 Aug 2026, 23-Aug-2026
  m = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/,]+(\d{2}|\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon !== undefined) return utcDate(+m[3], mon, +m[1]);
  }

  // Aug 23, 2026
  m = s.match(/^([A-Za-z]{3,9})[\s\-]+(\d{1,2}),?[\s\-]+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (mon !== undefined) return utcDate(+m[3], mon, +m[2]);
  }

  return null;
}

/** Like parseDate but throws a ValidationError naming the field when a non-empty value is invalid */
export function requireValidDate(v: unknown, field: string): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = parseDate(v);
  if (!d) throw new ValidationError(`${field} "${v}" is not a valid date (use DD/MM/YYYY or YYYY-MM-DD)`);
  return d;
}

export function cleanString(v: unknown, maxLen = 500): string {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, maxLen);
}

/** Picks only the listed keys that are present in the body (whitelist for updates) */
export function pick<T extends string>(body: any, keys: readonly T[]): Partial<Record<T, any>> {
  const out: Partial<Record<T, any>> = {};
  if (!body || typeof body !== 'object') return out;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) out[k] = body[k];
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isEmail(v: string) {
  return EMAIL_RE.test(v);
}

/**
 * Next number in a sequence like PAY-2026-0007, based on the highest existing number
 * (not a row count, which breaks after deletes).
 */
export async function nextSequenceNumber(
  prefix: string,
  findExisting: (prefix: string) => Promise<string[]>,
  pad = 4
): Promise<string> {
  const year = new Date().getFullYear();
  const full = `${prefix}-${year}-`;
  const existing = await findExisting(full);
  let max = 0;
  for (const n of existing) {
    const m = n.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${full}${String(max + 1).padStart(pad, '0')}`;
}
