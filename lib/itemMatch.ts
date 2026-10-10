// Matches chain PO item names ("MTR Rava Idli Ready Mix 500 g") to Tally sale-invoice
// item names ("MTR-Inst. Rava Idli 30x500g"). The two never share exact wording, so we
// compare pack size + the distinguishing words of the name.

// Brand / filler words that do not tell two items apart
const STOP_WORDS = new Set([
  'mtr', 'mother', 'mothers', 'recipe', 'mr', 'inst', 'instant', 'ready', 'mix', 'pack',
  'multipack', 'mutlipack', 'pouch', 'gp', 'jar', 'pet', 'with', 'and', 'the', 'new', 'bigi',
]);

const SIZE_RE = /(\d+(?:\.\d+)?)\s*(kgs?|gms?|grams?|gp|g|ml|ltrs?|l)(?![a-z])/gi;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Pack size normalised to grams / millilitres, e.g. "18X1KG" -> "g1000", "500 g" -> "g500"
export function packSize(name: string): string {
  const matches = Array.from((name || '').matchAll(SIZE_RE));
  const m = matches[matches.length - 1];
  if (!m) return '';
  const value = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('k')) return `g${Math.round(value * 1000)}`;
  if (unit === 'ml') return `ml${Math.round(value)}`;
  if (unit.startsWith('l')) return `ml${Math.round(value * 1000)}`;
  return `g${Math.round(value)}`;
}

function nameTokens(name: string): string[] {
  const all = (name || '')
    .toLowerCase()
    .replace(SIZE_RE, ' ')
    .replace(/\d+\s*x\s*/g, ' ') // case pack prefix "30x"
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(t => t.length >= 2 && !/^\d+$/.test(t));
  const useful = all.filter(t => !STOP_WORDS.has(t));
  return useful.length ? useful : all;
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

// Tolerates Tally typos / abbreviations: "vermimacilli" ~ "vermicelli", "mustrd" ~ "mustard"
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const ba = bigrams(a);
  const rest = bigrams(b);
  let common = 0;
  ba.forEach(g => {
    const i = rest.indexOf(g);
    if (i !== -1) { common++; rest.splice(i, 1); }
  });
  return (2 * common) / (ba.length + bigrams(b).length) >= 0.55;
}

// Share of distinguishing words in common (0..1), and whether one name's words are all in the other
function nameScore(a: string, b: string): { score: number; subset: boolean } {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return { score: 0, subset: false };
  const rest = [...tb];
  let common = 0;
  ta.forEach(t => {
    const i = rest.findIndex(r => sameWord(t, r));
    if (i !== -1) { common++; rest.splice(i, 1); }
  });
  return { score: (2 * common) / (ta.length + tb.length), subset: common === Math.min(ta.length, tb.length) };
}

export type PoItemForMatch = { chainItemName: string; tallyItemName?: string | null; unitPrice?: number };
export type BilledItemForMatch = { itemName: string; tallyItemName?: string | null; rate?: number };

// 0 = not the same item. Mapped Tally name wins outright; otherwise pack size must agree
// and the names must share most of their distinguishing words (rate only breaks ties).
export function itemMatchScore(po: PoItemForMatch, billed: BilledItemForMatch): number {
  const billedNames = [billed.itemName, billed.tallyItemName || ''].filter(Boolean);
  const mapped = squash(po.tallyItemName || '');
  if (mapped && billedNames.some(n => squash(n) === mapped)) return 3;

  const poSize = packSize(po.chainItemName);
  const billedSize = packSize(billed.itemName);
  if (poSize && billedSize && poSize !== billedSize) return 0;
  const sizeEqual = !!poSize && poSize === billedSize;

  const byChain = nameScore(po.chainItemName, billed.itemName);
  const byTally = nameScore(po.tallyItemName || '', billed.itemName);
  const { score, subset } = byTally.score > byChain.score ? byTally : byChain;
  const rateClose = !!po.unitPrice && !!billed.rate && Math.abs(po.unitPrice - billed.rate) / po.unitPrice <= 0.05;

  // "Mango Pickle" vs "Mixed Pickle" share half their words but are different items
  if (score >= 0.6 || (subset && score >= 0.5)) {
    return score + (sizeEqual ? 0.2 : 0) + (rateClose ? 0.1 : 0);
  }
  return 0;
}

// Index of the PO item a billed line belongs to, or -1 when nothing matches
export function bestPoItemIndex(poItems: PoItemForMatch[], billed: BilledItemForMatch): number {
  let best = -1;
  let bestScore = 0;
  poItems.forEach((p, i) => {
    const s = itemMatchScore(p, billed);
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return best;
}
