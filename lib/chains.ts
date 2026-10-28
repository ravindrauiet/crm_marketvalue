// Canonical retail-chain names, as stored on POs and item mappings
export const CHAINS = ['AMAZON', 'BIGBASKET', 'BLINKIT', 'CITYMALL', 'DEERIKA', 'DMART', 'FLIPKART', 'RELIANCE', 'SWIGGY', 'VISHAL', 'ZEPTO', 'OTHER'];

// Also covers the legal party names on Tally invoices and payment advices
const ALIASES: Array<[RegExp, string]> = [
  [/^BIG\s*BASKET|INNOVATIVE RETAIL|SUPERMARKET GROCERY SUPPLIES/, 'BIGBASKET'],
  [/^SWIGGY|SCOOTSY|INSTAMART/, 'SWIGGY'],
  [/^VISHAL/, 'VISHAL'],
  [/^D[\s-]?MART|AVENUE SUPERMARTS/, 'DMART'],
  [/^RELIANCE|^RCCL|^METRO/, 'RELIANCE'],
  [/^ZEPTO|KIRANAKART|GEDDIT/, 'ZEPTO'],
  [/^BLINK|BLINKIT|GROFERS/, 'BLINKIT'],
  [/^CITY\s*MALL|CMUNITY/, 'CITYMALL'],
  [/^AMAZON|CLICKTECH|APPARIO/, 'AMAZON'],
  [/^FLIPKART|INSTAKART/, 'FLIPKART'],
  [/^DEERIKA|DJT RETAIL/, 'DEERIKA'],
];

/** "Big Basket" / "bigbasket" / "Vishal Mega Mart" -> "BIGBASKET" / "BIGBASKET" / "VISHAL" */
export function normalizeChain(name: unknown): string {
  const s = String(name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return '';
  return ALIASES.find(([re]) => re.test(s))?.[1] || s;
}
