// Brand from item wording when no mapping names one (checked in order)
const BRAND_PATTERNS: Array<[RegExp, string]> = [
  [/HEALTHY HUNGER|HUNGER JAGGERY|JAGGRY/, 'HEALTHY HUNGER'],
  [/MOTHER'?S RECIPE|\bMOTHERS?\b/, "MOTHER'S RECIPE"],
  [/\bMTR\b/, 'MTR'],
  [/\bEASTERN\b/, 'EASTERN'],
  [/SALSALITO|TEX[\s-]?MEX/, 'SALSALITO'],
  [/MOM'?S CHOICE/, "MOM'S CHOICE"],
  [/\bMARVEL\b/, 'MARVEL'],
  [/DILBAHAR/, 'DILBAHAR'],
  [/HANDBRAND/, 'HANDBRAND'],
  [/CAMPAIGN/, 'CAMPAIGN'],
];

/** Upper-case brand guessed from item names, or '' when none is recognised */
export function inferBrand(...texts: Array<string | null | undefined>): string {
  const text = texts.filter(Boolean).join(' ').toUpperCase();
  return BRAND_PATTERNS.find(([re]) => re.test(text))?.[1] || '';
}

/** A mapping's stored brand, or the guessed one; upper-case so "Mother's Recipe" and "MOTHER'S RECIPE" group together */
export function brandOf(brandName: string | null | undefined, ...texts: Array<string | null | undefined>): string {
  return (brandName || '').trim().toUpperCase() || inferBrand(...texts);
}
