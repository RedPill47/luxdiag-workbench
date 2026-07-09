// "Try your own text" — the interactive proof that the workbench is a reusable
// tool, not a viewer for one dataset. A visitor pastes any passage and drives
// the two core mechanisms on their OWN data, entirely client-side:
//   1. the shared character-offset overlay engine (segmentText) — select text,
//      mark it as a layer, see the same segmentation the studies use;
//   2. character-n-gram BM25 retrieval (the paper's retriever, ported to the
//      client) — type a query, rank chunks of the pasted text, highlight the hit.
// No account, no API key, no cost.

import { useMemo, useRef, useState } from "react";
import { segmentText } from "../lib/offsets.js";
import { chunkText, rankChunks } from "../lib/charBm25.js";
import { CRITICAL_TINT, DISTRACTOR_TINT } from "../lib/palette.js";

const CATEGORY_TINT = "rgba(91, 107, 181, 0.18)";
const FLASH_TINT = "rgba(47, 93, 138, 0.28)";

const LAYERS = [
  { kind: "critical", label: "Evidence", tint: CRITICAL_TINT, dot: "#2f8a5b" },
  { kind: "distractor", label: "Distractor", tint: DISTRACTOR_TINT, dot: "#c0453b" },
  { kind: "category", label: "Phenomenon", tint: CATEGORY_TINT, dot: "#5b6bb5" },
];

const SAMPLE_EN =
  "Detective Berg reached the old mill before dawn. The miller had vanished, " +
  "leaving a cold cup of coffee and an open ledger on the desk. She suspected the " +
  "missing pages held the motive. By noon she had traced the ledger to a bank in " +
  "the capital. The case, she realised, was about money, not revenge.";

const SAMPLE_LB =
  "De Kommissär Berg ass virum Dag bei d’al Millen komm. De Miller war fort, " +
  "en huet just eng kal Taass Kaffi an e opent Buch op der Bänk hannerlooss. Hie " +
  "vermutt, datt déi feelend Säiten de Grond verroden. Um Mëtteg hat hien d’Spuer " +
  "bis bei eng Bank an der Stad verfollegt.";

export default function Playground({ onExit }) {
  const [text, setText] = useState(SAMPLE_EN);
  const [spans, setSpans] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [flash, setFlash] = useState(null);
  const sel = useRef({ start: 0, end: 0 });

  const captureSel = (e) =>
    (sel.current = { start: e.target.selectionStart, end: e.target.selectionEnd });

  function mark(kind, label) {
    const { start, end } = sel.current;
    if (end > start) setSpans((s) => [...s, { start, end, kind, label }]);
  }

  function retrieve(e) {
    e?.preventDefault();
    setFlash(null);
    setResults(rankChunks(chunkText(text), query, 5));
  }

  // Reset dependent state when the passage changes so offsets never dangle.
  function loadSample(sample) {
    setText(sample);
    setSpans([]);
    setResults(null);
    setFlash(null);
  }

  const overlays = useMemo(() => {
    const arr = [...spans];
    if (flash) arr.push({ ...flash, kind: "flash" });
    return arr;
  }, [spans, flash]);

  const segments = useMemo(() => segmentText(text, overlays), [text, overlays]);

  const bgFor = (segOverlays) => {
    const kinds = new Set(segOverlays.map((o) => o.kind));
    if (kinds.has("flash")) return FLASH_TINT;
    if (kinds.has("critical")) return CRITICAL_TINT;
    if (kinds.has("distractor")) return DISTRACTOR_TINT;
    if (kinds.has("category")) return CATEGORY_TINT;
    return "transparent";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Try your own text</h2>
          <p className="mt-0.5 text-xs text-stone-600">
            Paste any passage and drive the workbench on your own data: mark evidence spans
            (the shared coordinate system) and run the paper's character-BM25 retriever. All
            in your browser, no account, no API key.
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="shrink-0 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400"
        >
          ← Back to the studies
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Input + marking */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-stone-600">Your passage</label>
            <div className="flex gap-1.5 text-[11px]">
              <button type="button" onClick={() => loadSample(SAMPLE_EN)} className="text-accent hover:underline">
                English sample
              </button>
              <span className="text-stone-300">·</span>
              <button type="button" onClick={() => loadSample(SAMPLE_LB)} className="text-accent hover:underline">
                Luxembourgish sample
              </button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSpans([]);
              setResults(null);
              setFlash(null);
            }}
            onSelect={captureSel}
            rows={9}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-accent focus:outline-none"
            placeholder="Paste a passage in any language…"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-stone-400">Select text above, then mark it:</span>
            {LAYERS.map((l) => (
              <button
                key={l.kind}
                type="button"
                onClick={() => mark(l.kind, l.label)}
                className="flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 transition hover:border-accent hover:bg-accent-soft"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: l.dot }} />
                {l.label}
              </button>
            ))}
            {spans.length > 0 && (
              <button
                type="button"
                onClick={() => setSpans([])}
                className="text-[11px] text-stone-400 hover:text-stone-700 hover:underline"
              >
                clear spans
              </button>
            )}
          </div>
        </div>

        {/* Rendered overlays + retrieval */}
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-stone-600">
              Overlay view <span className="text-stone-400">— the same coordinate engine, on your text</span>
            </div>
            <div className="min-h-[7rem] rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed">
              {text.trim() ? (
                segments.map((seg, i) => {
                  const bg = bgFor(seg.overlays);
                  return (
                    <span
                      key={i}
                      style={bg === "transparent" ? undefined : { background: bg, borderRadius: 2 }}
                    >
                      {seg.text}
                    </span>
                  );
                })
              ) : (
                <span className="text-stone-400">Paste some text to see the overlay engine.</span>
              )}
            </div>
          </div>

          <form onSubmit={retrieve} className="space-y-2">
            <div className="text-xs font-medium text-stone-600">
              Retrieve over your passage <span className="text-stone-400">— character-BM25</span>
            </div>
            <div className="flex gap-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. missing pages money"
                className="flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className="rounded-md border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent hover:text-white disabled:opacity-50"
              >
                Retrieve
              </button>
            </div>
            {results && results.length === 0 && (
              <p className="text-[11px] text-stone-400">No chunk matched that query.</p>
            )}
            {results && results.length > 0 && (
              <ul className="space-y-1">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setFlash({ start: r.start, end: r.end })}
                      className="flex w-full items-start gap-2 rounded-md border border-stone-200 px-2 py-1.5 text-left text-xs transition hover:border-accent hover:bg-accent-soft"
                    >
                      <span className="w-4 shrink-0 font-mono text-stone-400">{r.rank}</span>
                      <span className="w-10 shrink-0 tabular-nums text-stone-500">{r.score.toFixed(2)}</span>
                      <span className="line-clamp-2 flex-1 text-stone-600">{r.text.trim()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
