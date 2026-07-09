// Turns a selected question + its text's gold annotations into the flat
// overlay list PassageView renders. Overlay shape:
//   { id, kind: 'critical'|'distractor'|'category', label, start, end,
//     category?, regime?, excluded?, surface? }

export function buildPassageOverlays({ question, annotationRows = [], meta }) {
  const overlays = [];

  if (question) {
    (question.critical_spans ?? []).forEach((s, i) =>
      overlays.push({
        id: `crit-${i}`,
        kind: "critical",
        label: "Critical evidence",
        start: s.start,
        end: s.end,
      })
    );
    (question.distractor_spans ?? []).forEach((s, i) =>
      overlays.push({
        id: `dist-${i}`,
        kind: "distractor",
        label: "Distractor",
        start: s.start,
        end: s.end,
      })
    );
  }

  // Category overlays use the GOLD occurrences for the text.
  for (const row of annotationRows) {
    const catMeta = meta?.categories?.[row.category] ?? {};
    (row.gold_occurrences ?? row.gold ?? []).forEach((occ, i) =>
      overlays.push({
        id: `cat-${row.category}-${i}`,
        kind: "category",
        category: row.category,
        regime: catMeta.regime,
        excluded: !!catMeta.excluded,
        label: catMeta.label ?? row.category,
        desc: catMeta.desc,
        start: occ.start,
        end: occ.end,
        surface: occ.surface,
      })
    );
  }

  return overlays;
}

/**
 * Group the category overlays present in `overlays` into distinct toggle
 * descriptors, ordered and banded by regime.
 * Returns [{ category, label, regime, excluded, count }, ...].
 */
export function categoryToggles(overlays) {
  const byCat = new Map();
  for (const o of overlays) {
    if (o.kind !== "category") continue;
    if (!byCat.has(o.category)) {
      byCat.set(o.category, {
        category: o.category,
        label: o.label,
        regime: o.regime,
        excluded: o.excluded,
        desc: o.desc,
        count: 0,
      });
    }
    byCat.get(o.category).count += 1;
  }
  return [...byCat.values()].sort(
    (a, b) => (a.regime ?? 9) - (b.regime ?? 9) || a.label.localeCompare(b.label)
  );
}
