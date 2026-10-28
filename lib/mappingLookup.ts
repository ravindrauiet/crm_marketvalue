// Finds the item mapping for a chain PO line. Shared by the Shortfall planner and the
// Item Mapping "needs mapping" list so both agree on what is mapped.
type MappingLike = { chainName: string; chainItemCode: string; chainItemName: string; eanCode: string | null };

const nameKey = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const eanList = (s: string | null | undefined) => (s || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

/** Same chain by item code / EAN / exact name, then any chain by EAN (an EAN is the product's own barcode) */
export function makeMappingFinder<M extends MappingLike>(mappings: M[]) {
  return (chain: string, code: string, ean: string, name: string): M | null => {
    const c = code.trim().toLowerCase(), e = ean.trim().toLowerCase(), n = nameKey(name);
    const inChain = mappings.filter(m => m.chainName.toUpperCase() === chain);
    return (c && inChain.find(m => m.chainItemCode.toLowerCase() === c || eanList(m.eanCode).includes(c)))
      || (e && inChain.find(m => eanList(m.eanCode).includes(e) || m.chainItemCode.toLowerCase() === e))
      || (n && inChain.find(m => nameKey(m.chainItemName) === n))
      || (e && mappings.find(m => eanList(m.eanCode).includes(e)))
      || null;
  };
}
