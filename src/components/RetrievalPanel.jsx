import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { loadQuestionRetrieval, liveRetrieve } from "../lib/retrievalClient.js";

const K_OPTIONS = [1, 3, 5, 10];
const CRITICAL = "#2f8a5b";
const DISTRACTOR = "#c0453b";
const ACCENT = "#2f5d8a"; // concrete hex — CSS vars don't resolve in SVG stroke attrs

// Derive @k metrics from the ranked list (every number traces to the ranked
// chunks + the chunk→text map).
function computeMetrics(ranked, k, question, chunksById) {
  if (!ranked) return null;
  const topK = ranked.slice(0, k);
  const inSource = (c) => chunksById.get(c.chunk_id)?.text_id === question.text_id;
  return {
    sourceRecallAtK: topK.some(inSource) ? 1 : 0,
    evidenceRecallAtK: topK.some((c) => c.contains_critical) ? 1 : 0,
    evidenceRecallAt1: ranked[0]?.contains_critical ? 1 : 0,
  };
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-stone-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-stone-800">
        {value === null ? "–" : value.toFixed(2)}
      </div>
    </div>
  );
}

function RecallCurve({ curves, setting, retriever, k }) {
  const byRetriever = curves?.[setting] ?? {};
  const retrievers = Object.keys(byRetriever);
  const data = useMemo(() => {
    return K_OPTIONS.map((kk) => {
      const row = { k: kk };
      for (const r of retrievers) row[r] = byRetriever[r]?.[String(kk)];
      return row;
    });
  }, [byRetriever, retrievers]);

  if (retrievers.length === 0)
    return (
      <p className="text-xs text-stone-400">
        No corpus recall curve available for this setting in the current data.
      </p>
    );

  const selectedPresent = retrievers.includes(retriever);

  return (
    <div>
      <div className="h-44 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <XAxis
              dataKey="k"
              type="number"
              domain={[1, 10]}
              ticks={K_OPTIONS}
              tick={{ fontSize: 11, fill: "#78716c" }}
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tick={{ fontSize: 11, fill: "#78716c" }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
              formatter={(v, name) => [typeof v === "number" ? v.toFixed(3) : v, name]}
              labelFormatter={(l) => `k = ${l}`}
            />
            <ReferenceLine x={k} stroke="#d6d3d1" strokeDasharray="3 3" />
            {retrievers.map((r) => (
              <Line
                key={r}
                type="monotone"
                dataKey={r}
                stroke={r === retriever ? ACCENT : "#e7e5e4"}
                strokeWidth={r === retriever ? 2.5 : 1}
                dot={r === retriever ? { r: 3 } : false}
                activeDot={r === retriever ? { r: 4 } : false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-stone-400">
        Corpus evidence-recall vs k · {setting.replace("_", "-")} · selected retriever in accent
        {!selectedPresent && " (not available at this setting)"}
      </p>
    </div>
  );
}

// Live retrieval (brief §5): run the same char-BM25 retriever the corpus was
// built with, on a query the user types. Hits the /api/retrieve serverless
// function. No gold flags — this query has no annotated answer key.
function LiveRetrieval({ setting, k, question, chunksById, onChunkClick }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ status: "idle", ranked: null, error: null });

  const restricted = setting === "text_restricted";

  async function run(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setState({ status: "loading", ranked: null, error: null });
    try {
      const out = await liveRetrieve({
        query: q,
        setting,
        text_id: restricted ? question.text_id : undefined,
        k,
      });
      setState({ status: "done", ranked: out.ranked_chunks ?? [], error: null });
    } catch (err) {
      setState({ status: "error", ranked: null, error: String(err) });
    }
  }

  return (
    <div className="space-y-2 border-t border-dashed border-stone-200 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-stone-700">Live retrieval</h3>
        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
          char-BM25 · live
        </span>
      </div>
      <p className="text-[11px] text-stone-400">
        Type any query and run the char-n-gram BM25 retriever over the{" "}
        {restricted ? "current passage" : "whole corpus"} (setting &amp; k from above). Click a
        hit to highlight it in the passage{restricted ? "" : " — jumping to its text if needed"}.
      </p>
      <form onSubmit={run} className="flex gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Kommissär Mord Bësch"
          className="flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!query.trim() || state.status === "loading"}
          className="rounded-md border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.status === "loading" ? "…" : "Retrieve"}
        </button>
      </form>

      {state.status === "error" && (
        <p className="text-[11px] text-[color:var(--color-trap-distractor)]">
          Live retrieval unavailable ({state.error}). The serverless endpoint runs only on the
          deployed build.
        </p>
      )}
      {state.status === "done" && state.ranked.length === 0 && (
        <p className="text-[11px] text-stone-400">No chunk matched that query.</p>
      )}
      {state.status === "done" && state.ranked.length > 0 && (
        <ul className="space-y-1">
          {state.ranked.map((c) => {
            const chunk = chunksById.get(c.chunk_id);
            const crossText = chunk && chunk.text_id !== question.text_id;
            return (
              <li key={c.chunk_id}>
                <button
                  type="button"
                  onClick={() => onChunkClick(c)}
                  title={
                    crossText
                      ? `Jump to ${chunk.text_id} and highlight this chunk`
                      : "Show in passage"
                  }
                  className="flex w-full items-center gap-2 rounded-md border border-stone-200 px-2.5 py-1.5 text-left text-xs transition hover:border-accent hover:bg-accent-soft"
                >
                  <span className="w-5 shrink-0 font-mono text-stone-400">{c.rank}</span>
                  <span
                    title={c.chunk_id}
                    className="min-w-0 flex-1 truncate font-mono text-stone-600"
                  >
                    {c.chunk_id}
                  </span>
                  <span className="shrink-0 tabular-nums text-stone-500">
                    {typeof c.score === "number" ? c.score.toFixed(2) : c.score}
                  </span>
                  {crossText && (
                    <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      → {chunk.text_id}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function RetrievalPanel({
  selection,
  question,
  meta,
  chunksById,
  aggregates,
  onPatch,
  onChunkClick,
  onLiveChunkClick,
  retrievalMemory,
  custom,
}) {
  const { retriever, setting, k } = selection;
  const [byKey, setByKey] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Uploaded datasets carry retrieval in memory; the released dataset fetches
    // it lazily per question.
    if (retrievalMemory) {
      setByKey(retrievalMemory.get(question.question_id) ?? new Map());
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    loadQuestionRetrieval(question.question_id).then((m) => {
      if (live) {
        setByKey(m);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [question.question_id, retrievalMemory]);

  const ranked = byKey?.get(`${retriever}|${setting}`) ?? null;
  const metrics = useMemo(
    () => computeMetrics(ranked, k, question, chunksById),
    [ranked, k, question, chunksById]
  );
  const topK = ranked ? ranked.slice(0, k) : [];

  const btn = (active) =>
    "rounded-md border px-2.5 py-1 text-xs transition " +
    (active
      ? "border-accent bg-accent-soft text-accent"
      : "border-stone-300 bg-white text-stone-600 hover:border-stone-400");

  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-stone-900">Retrieval</h2>

      {/* Controls (write to the global selection) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-xs text-stone-500">Retriever</label>
          <select
            className="flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs focus:border-accent focus:outline-none"
            value={retriever}
            onChange={(e) => onPatch({ retriever: e.target.value })}
          >
            {Object.entries(meta.retrievers).map(([key, v]) => (
              <option key={key} value={key} title={v.desc}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        {meta.retrievers?.[retriever]?.desc && (
          <p className="pl-[4.5rem] text-[11px] text-stone-400">{meta.retrievers[retriever].desc}</p>
        )}

        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-xs text-stone-500">Setting</label>
          <div className="flex gap-1.5">
            {["text_restricted", "open_corpus"].map((s) => (
              <button
                key={s}
                type="button"
                title={meta.settings?.[s]?.desc}
                className={btn(setting === s)}
                onClick={() => onPatch({ setting: s })}
              >
                {meta.settings?.[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-xs text-stone-500">k</label>
          <div className="flex gap-1.5">
            {K_OPTIONS.map((kk) => (
              <button key={kk} type="button" className={btn(k === kk)} onClick={() => onPatch({ k: kk })}>
                {kk}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-stone-400">Loading retrieval…</p>
      ) : !ranked ? (
        <p className="text-xs text-stone-400">
          No retrieval record for this (question · retriever · setting) in the current data.
        </p>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-2">
            <StatTile label={`Source recall@${k}`} value={metrics.sourceRecallAtK} />
            <StatTile label="Evidence recall@1" value={metrics.evidenceRecallAt1} />
            <StatTile label={`Evidence recall@${k}`} value={metrics.evidenceRecallAtK} />
          </div>

          {/* Ranked chunk list */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-stone-400">
              <span>Top {k} chunks</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: CRITICAL }} /> critical
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: DISTRACTOR }} /> distractor
                </span>
              </span>
            </div>
            <ul className="space-y-1">
              {topK.map((c, i) => {
                const chunk = chunksById.get(c.chunk_id);
                const crossText = chunk && chunk.text_id !== question.text_id;
                return (
                  <li key={c.chunk_id}>
                    <button
                      type="button"
                      onClick={() => onChunkClick(c)}
                      disabled={crossText}
                      title={crossText ? `From ${chunk.text_id} — not in the current passage` : "Show in passage"}
                      className={
                        "flex w-full items-center gap-2 rounded-md border border-stone-200 px-2.5 py-1.5 text-left text-xs transition " +
                        (crossText ? "opacity-60" : "hover:border-accent hover:bg-accent-soft")
                      }
                    >
                      <span className="w-5 shrink-0 font-mono text-stone-400">{i + 1}</span>
                      <span
                        title={c.chunk_id}
                        className="min-w-0 flex-1 truncate font-mono text-stone-600"
                      >
                        {c.chunk_id}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 tabular-nums text-stone-500">
                        {c.score.toFixed(2)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {c.contains_critical && (
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CRITICAL }} />
                        )}
                        {c.contains_distractor && (
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: DISTRACTOR }} />
                        )}
                      </span>
                      {crossText && (
                        <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">
                          {chunk.text_id}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Recall curve */}
          <RecallCurve
            curves={aggregates.evidence_recall_curves}
            setting={setting}
            retriever={retriever}
            k={k}
          />
        </>
      )}

      {meta.flags?.live_retrieval_enabled && !custom && (
        <LiveRetrieval
          setting={setting}
          k={k}
          question={question}
          chunksById={chunksById}
          onChunkClick={onLiveChunkClick}
        />
      )}
    </section>
  );
}
