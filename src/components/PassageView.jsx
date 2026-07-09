import { useEffect, useMemo, useRef, useState } from "react";
import { segmentText } from "../lib/offsets.js";
import { categoryToggles } from "../lib/overlays.js";
import {
  CRITICAL_TINT,
  DISTRACTOR_TINT,
  BOTH_TINT,
  ANNOT_COLORS,
  regimeColor,
} from "../lib/palette.js";

// Inline style for one rendered run, given the overlays that cover it.
// Background tint is reserved for critical/distractor; categories are drawn
// as stacked coloured underlines; a clicked annotation adds a status ring.
function segmentStyle(covering) {
  const hasCritical = covering.some((o) => o.kind === "critical");
  const hasDistractor = covering.some((o) => o.kind === "distractor");
  const cats = covering.filter((o) => o.kind === "category");
  const annot = covering.find((o) => o.kind === "annot");

  const style = {};
  if (hasCritical && hasDistractor) style.background = BOTH_TINT;
  else if (hasCritical) style.background = CRITICAL_TINT;
  else if (hasDistractor) style.background = DISTRACTOR_TINT;

  const shadows = cats.map(
    (c, i) => `inset 0 ${-2 * (i + 1)}px 0 ${regimeColor(c.regime, c.excluded)}`
  );
  if (annot) shadows.push(`0 0 0 2px ${ANNOT_COLORS[annot.status] ?? "#78716c"}`);
  if (shadows.length) style.boxShadow = shadows.join(", ");
  if (cats.length) style.paddingBottom = `${2 * cats.length}px`;
  return style;
}

function Chip({ active, color, muted, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition " +
        (active
          ? "border-transparent text-white"
          : "border-stone-300 bg-white text-stone-500 hover:border-stone-400")
      }
      style={active ? { backgroundColor: color } : undefined}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: active ? "rgba(255,255,255,0.85)" : color }}
      />
      <span className={muted ? "line-through decoration-1" : undefined}>
        {children}
      </span>
    </button>
  );
}

export default function PassageView({
  title,
  text = "",
  overlays = [],
  visible,
  onToggle,
  flash = null,
  annot = null,
}) {
  const hasCritical = overlays.some((o) => o.kind === "critical");
  const hasDistractor = overlays.some((o) => o.kind === "distractor");
  const catToggles = useMemo(() => categoryToggles(overlays), [overlays]);

  const flashRef = useRef(null);
  const annotRef = useRef(null);
  const [flashing, setFlashing] = useState(false);

  // On a new chunk click (nonce changes), scroll the range into view and pulse.
  useEffect(() => {
    if (!flash) return;
    flashRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 1200);
    return () => clearTimeout(t);
  }, [flash?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // On an annotation-cell click, scroll to the first highlighted occurrence.
  useEffect(() => {
    if (!annot) return;
    annotRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [annot?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleOverlays = useMemo(
    () =>
      overlays.filter((o) => {
        if (o.kind === "critical") return visible.critical;
        if (o.kind === "distractor") return visible.distractor;
        if (o.kind === "category") return visible.categories.has(o.category);
        return true;
      }),
    [overlays, visible]
  );

  // Fold in the flash range and any annotation highlights so segmentation
  // splits on their boundaries and the covered run(s) can be referenced.
  const renderOverlays = useMemo(() => {
    let arr = visibleOverlays;
    if (flash)
      arr = [...arr, { id: "flash", kind: "flash", label: "Retrieved chunk", start: flash.start, end: flash.end }];
    if (annot)
      arr = [
        ...arr,
        ...annot.ranges.map((r, i) => ({
          id: `annot-${i}`,
          kind: "annot",
          status: r.status,
          label: r.status,
          start: r.start,
          end: r.end,
        })),
      ];
    return arr;
  }, [visibleOverlays, flash, annot]);

  const segments = useMemo(() => segmentText(text, renderOverlays), [text, renderOverlays]);
  const firstFlashIdx = useMemo(
    () => segments.findIndex((s) => s.overlays.some((o) => o.kind === "flash")),
    [segments]
  );
  const firstAnnotIdx = useMemo(
    () => segments.findIndex((s) => s.overlays.some((o) => o.kind === "annot")),
    [segments]
  );

  // Group category toggles by regime for a banded control row.
  const byRegime = useMemo(() => {
    const m = new Map();
    for (const c of catToggles) {
      const r = c.excluded ? "x" : c.regime ?? "?";
      if (!m.has(r)) m.set(r, []);
      m.get(r).push(c);
    }
    return [...m.entries()];
  }, [catToggles]);

  return (
    <section className="rounded-lg border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          <span className="text-xs text-stone-400">{text.length} chars</span>
        </div>

        {/* Overlay toggles */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {hasCritical && (
            <Chip
              active={visible.critical}
              color="#2f8a5b"
              onClick={() => onToggle("critical")}
              title="Critical evidence spans"
            >
              Critical
            </Chip>
          )}
          {hasDistractor && (
            <Chip
              active={visible.distractor}
              color="#c0453b"
              onClick={() => onToggle("distractor")}
              title="Distractor spans"
            >
              Distractor
            </Chip>
          )}
        </div>

        {byRegime.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {byRegime.map(([regime, cats]) => (
              <div key={regime} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] uppercase tracking-wide text-stone-400">
                  {regime === "x" ? "Excluded" : `Regime ${regime}`}
                </span>
                {cats.map((c) => (
                  <Chip
                    key={c.category}
                    active={visible.categories.has(c.category)}
                    color={regimeColor(c.regime, c.excluded)}
                    muted={c.excluded}
                    onClick={() => onToggle("category", c.category)}
                    title={`${c.label} — ${c.count} occurrence${c.count === 1 ? "" : "s"}${c.desc ? `\n${c.desc}` : ""}`}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The passage */}
      <div className="px-6 py-5">
        <p className="whitespace-pre-wrap font-serif text-[17px] leading-8 text-stone-800">
          {segments.map((seg, i) => {
            const marks = seg.overlays.filter((o) => o.kind !== "flash");
            const isFlash = seg.overlays.some((o) => o.kind === "flash");
            if (marks.length === 0 && !isFlash) return seg.text;
            const labels = marks.map((o) => o.label);
            const ref =
              i === firstFlashIdx ? flashRef : i === firstAnnotIdx ? annotRef : undefined;
            return (
              <span
                key={i}
                ref={ref}
                style={segmentStyle(marks)}
                title={labels.join(" · ")}
                className={
                  "rounded-[1px] " +
                  (isFlash && flashing
                    ? "outline outline-2 outline-offset-1 outline-accent transition-all"
                    : "")
                }
              >
                {seg.text}
              </span>
            );
          })}
        </p>
      </div>
    </section>
  );
}
