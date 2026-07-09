// Annotation agreement uses Lux-ano-pip's official metric: surface-multiset
// comparison per (text, category). Predictions are surface bags (strings);
// gold occurrences (with offsets) drive passage highlighting.

export function countBy(arr) {
  const m = new Map();
  for (const s of arr) m.set(s, (m.get(s) || 0) + 1);
  return m;
}

/** matched / missed / spurious counts of pred surfaces vs gold surfaces. */
export function diffSurfaces(gold = [], pred = []) {
  const g = countBy(gold);
  const p = countBy(pred);
  let matched = 0;
  for (const [s, gc] of g) matched += Math.min(gc, p.get(s) || 0);
  return { matched, missed: gold.length - matched, spurious: pred.length - matched };
}

/**
 * Tag each gold occurrence matched/missed against an annotator's surface bag,
 * for passage highlighting. Occurrence surfaces may span a line break, so
 * compare on a newline-free key. First min(gold,pred) occurrences of a surface
 * count as matched, the rest missed.
 */
export function goldOccurrenceStatuses(goldOccurrences = [], predSurfaces = []) {
  const remaining = countBy(predSurfaces);
  const key = (s) => s.replace(/\n/g, "");
  const out = [];
  for (const occ of goldOccurrences) {
    const k = key(occ.surface);
    const left = remaining.get(k) || 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      out.push({ start: occ.start, end: occ.end, status: "matched" });
    } else {
      out.push({ start: occ.start, end: occ.end, status: "missed" });
    }
  }
  return out;
}
