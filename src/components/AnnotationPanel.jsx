import { useMemo } from "react";
import { diffSurfaces, goldOccurrenceStatuses } from "../lib/annotations.js";
import { ANNOT_COLORS, ANNOTATOR_TYPE_COLORS, regimeColor } from "../lib/palette.js";

// Compact labels for the systems in our own study; any dataset whose annotator
// keys aren't listed here falls back to its own meta.annotators[...].label.
const SHORT = {
  gold: "Gold",
  luxembert: "LuxB",
  modernbert: "ModB",
  xlm_roberta: "XLM-R",
  claude_opus_4_6: "Opus",
  gpt_5_4: "GPT",
  deepseek: "DS",
};

export default function AnnotationPanel({
  textId,
  annotationRows = [],
  meta,
  aggregates,
  activeCell,
  onCellClick,
}) {
  const catRow = useMemo(() => {
    const m = new Map();
    for (const r of annotationRows) m.set(r.category, r);
    return m;
  }, [annotationRows]);

  const categories = useMemo(
    () =>
      Object.entries(meta.categories ?? {})
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => (a.excluded ? 9 : a.regime) - (b.excluded ? 9 : b.regime)),
    [meta]
  );
  const annotators = useMemo(
    () => Object.entries(meta.annotators ?? {}).map(([key, v]) => ({ key, ...v })),
    [meta]
  );

  const f1 = aggregates.per_category_f1 ?? {};
  const aggF1 = useMemo(
    () =>
      Object.entries(aggregates.aggregate_f1 ?? {})
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => (a.type === b.type ? b.micro - a.micro : a.type === "encoder" ? -1 : 1)),
    [aggregates]
  );

  // Columns for the per-category F1 table are whatever systems the dataset
  // actually scored, in encoder-then-LLM order. This is what lets a completely
  // different upload (other languages, other models) render its own systems
  // instead of our four hard-coded ones.
  const f1Cols = useMemo(() => {
    const keys = [];
    const seen = new Set();
    for (const row of Object.values(aggregates.per_category_f1 ?? {})) {
      for (const k of Object.keys(row)) {
        // "regime" is a row annotation, not a scored system.
        if (k !== "regime" && !seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
    return keys
      .map((key) => ({
        key,
        label: SHORT[key] ?? meta.annotators?.[key]?.label ?? (key === "best_llm" ? "best LLM" : key),
        type: meta.annotators?.[key]?.type ?? (key.includes("llm") ? "llm" : "encoder"),
      }))
      .sort((a, b) => (a.type === b.type ? 0 : a.type === "encoder" ? -1 : 1));
  }, [aggregates, meta]);

  // Graceful degradation: an uploaded dataset need not carry an annotation layer.
  // Placed after all hooks so the rules of hooks hold.
  if (categories.length === 0 || annotators.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">Annotation</h2>
        <p className="mt-2 text-xs text-stone-400">
          This dataset doesn't include an annotation layer
          (<code>meta.categories</code> / <code>meta.annotators</code>), so there is no
          annotation matrix to show.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-stone-900">Annotation</h2>
        <span className="text-[11px] text-stone-400">{textId} · vs. gold</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-stone-500">
        {Object.entries(ANNOT_COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
            {k === "matched" ? "matched" : k === "spurious" ? "spurious (+)" : "missed (−)"}
          </span>
        ))}
        <span className="text-stone-400">· click a cell to highlight in the passage</span>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-2 py-1 text-left font-medium text-stone-500">
                Category
              </th>
              {annotators.map((a) => (
                <th key={a.key} className="px-1.5 py-1 text-center font-medium" title={a.label}>
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: ANNOTATOR_TYPE_COLORS[a.type] }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: ANNOTATOR_TYPE_COLORS[a.type] }}
                    />
                    {SHORT[a.key] ?? a.label ?? a.key}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const band = regimeColor(cat.regime, cat.excluded);
              return (
                <tr key={cat.key} className="border-t border-stone-100">
                  <td
                    className={
                      "whitespace-nowrap py-1 pl-2 pr-3 " +
                      (cat.excluded ? "text-stone-400" : "text-stone-700")
                    }
                    style={{ borderLeft: `3px solid ${band}` }}
                    title={
                      (cat.desc ? cat.desc + "\n" : "") +
                      (cat.excluded ? "Excluded (occurs once in the corpus)" : `Regime ${cat.regime}`)
                    }
                  >
                    {cat.label}
                  </td>
                  {annotators.map((a) => {
                    const row = catRow.get(cat.key);
                    const gold = row?.predictions?.gold ?? [];
                    const pred = row?.predictions?.[a.key] ?? [];
                    const diff = diffSurfaces(gold, pred);
                    const empty = gold.length === 0 && pred.length === 0;
                    const active =
                      activeCell?.category === cat.key && activeCell?.annotator === a.key;
                    if (empty)
                      return (
                        <td key={a.key} className="px-1.5 py-1 text-center text-stone-300">
                          ·
                        </td>
                      );
                    return (
                      <td key={a.key} className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            onCellClick(
                              cat.key,
                              a.key,
                              goldOccurrenceStatuses(row?.gold_occurrences ?? [], pred)
                            )
                          }
                          title={`${diff.matched} matched · ${diff.missed} missed · ${diff.spurious} spurious`}
                          className={
                            "inline-flex min-w-8 items-center justify-center gap-0.5 rounded px-1 py-0.5 tabular-nums transition " +
                            (active ? "ring-2 ring-accent" : "hover:bg-stone-100")
                          }
                        >
                          <span style={{ color: ANNOT_COLORS.matched }} className="font-semibold">
                            {diff.matched}
                          </span>
                          {diff.missed > 0 && (
                            <span style={{ color: ANNOT_COLORS.missed }}>−{diff.missed}</span>
                          )}
                          {diff.spurious > 0 && (
                            <span style={{ color: ANNOT_COLORS.spurious }}>+{diff.spurious}</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Division-of-labour callout — supplied by the dataset (meta.division_of_labour),
          so it describes the phenomena of whatever study is loaded rather than ours. */}
      {meta.division_of_labour?.items?.length > 0 && (
        <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-[11px] leading-5 text-stone-600">
          <div className="mb-1 font-medium text-stone-700">
            {meta.division_of_labour.title ?? "Division of labour"}
          </div>
          <ul className="list-disc space-y-1 pl-4">
            {meta.division_of_labour.items.map((it, i) => (
              <li key={i}>
                <span style={{ color: regimeColor(it.regime) }} className="font-medium">
                  {it.label}
                </span>{" "}
                {it.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-category F1 (corpus companion) */}
      <div>
        <div className="mb-1 text-[11px] font-medium text-stone-500">Per-category F1 (corpus)</div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="text-stone-500">
                <th className="px-2 py-1 text-left font-medium">Category</th>
                {f1Cols.map((c) => (
                  <th
                    key={c.key}
                    className="px-2 py-1 text-right font-medium"
                    style={{ color: ANNOTATOR_TYPE_COLORS[c.type] }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories
                .filter((cat) => f1[cat.key])
                .map((cat) => (
                  <tr key={cat.key} className="border-t border-stone-100">
                    <td
                      className="whitespace-nowrap py-1 pl-2 pr-3 text-stone-700"
                      style={{ borderLeft: `3px solid ${regimeColor(cat.regime, cat.excluded)}` }}
                    >
                      {cat.label}
                    </td>
                    {f1Cols.map((c) => {
                      const v = f1[cat.key][c.key];
                      const color = ANNOTATOR_TYPE_COLORS[c.type];
                      return (
                        <td
                          key={c.key}
                          className="px-2 py-1 text-right tabular-nums text-stone-700"
                          style={{
                            background: `linear-gradient(to left, ${color}20 ${v}%, transparent ${v}%)`,
                          }}
                        >
                          {v?.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aggregate F1 */}
      <div>
        <div className="mb-1 text-[11px] font-medium text-stone-500">Aggregate F1 (micro / macro)</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          {aggF1.map((a) => (
            <span key={a.key} className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: ANNOTATOR_TYPE_COLORS[a.type] }}
              />
              <span className="text-stone-600">{meta.annotators[a.key]?.label ?? a.key}</span>
              <span className="tabular-nums font-medium text-stone-800">
                {a.micro.toFixed(1)}
              </span>
              <span className="tabular-nums text-stone-400">/ {a.macro.toFixed(1)}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
