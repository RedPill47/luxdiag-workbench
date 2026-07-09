import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TRAP_COLORS } from "../lib/palette.js";
import { textTitle, questionNumber } from "../lib/labels.js";

const CLASS_ORDER = ["critical_only", "both", "distractor_only", "neither"];
const SHORT = {
  critical_only: "Critical",
  both: "Both",
  distractor_only: "Distractor",
  neither: "Neither",
};
const ACCENT = "#2f5d8a";
const RED = "#c0453b";

const colorByShort = Object.fromEntries(
  CLASS_ORDER.map((c) => [SHORT[c], TRAP_COLORS[c]])
);

function ClassTick({ x, y, payload }) {
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
      fill={colorByShort[payload.value] ?? "#78716c"}
    >
      {payload.value}
    </text>
  );
}

export default function RetrievalTrapExplorer({
  aggregates,
  meta,
  answers,
  questionsById,
  selectedQuestionId,
  onSelectQuestion,
  textGlosses,
}) {
  const rt = aggregates.retrieval_trap;
  const [selectedClass, setSelectedClass] = useState(null);

  const closedBookMean = useMemo(() => {
    const v = Object.values(aggregates.control_accuracy?.closed_book ?? {});
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }, [aggregates]);

  const data = useMemo(
    () =>
      CLASS_ORDER.map((c) => ({
        class: c,
        short: SHORT[c],
        accuracy: rt?.by_class?.[c]?.accuracy,
        distractor: rt?.by_class?.[c]?.distractor_choice_rate,
        n: rt?.by_class?.[c]?.n_questions,
      })),
    [rt]
  );

  // Per-question trap class at the aggregate's config, to power the drill-down.
  const settingRag = `rag_${rt?.setting}`;
  const qByClass = useMemo(() => {
    const m = {};
    if (!rt) return m;
    for (const a of answers) {
      if (a.setting !== settingRag || a.retriever !== rt.best_retriever || a.k !== rt.k)
        continue;
      (m[a.retrieval_trap_class] ??= new Set()).add(a.question_id);
    }
    return Object.fromEntries(Object.entries(m).map(([c, s]) => [c, [...s]]));
  }, [answers, settingRag, rt]);

  // Graceful degradation: an uploaded dataset need not carry trap aggregates.
  if (!rt || !rt.by_class) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">Retrieval-trap</h2>
        <p className="mt-2 text-xs text-stone-400">
          This dataset doesn't include retrieval-trap aggregates
          (<code>aggregates.retrieval_trap</code>), so there is nothing to chart here.
        </p>
      </section>
    );
  }

  const configLabel = `${meta.retrievers?.[rt.best_retriever]?.label ?? rt.best_retriever} · ${
    meta.settings?.[rt.setting]?.label ?? rt.setting
  } · k=${rt.k}`;

  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-stone-900">Retrieval-trap</h2>
        <span className="text-[11px] text-stone-400">{configLabel}</span>
      </div>

      <p className="text-xs text-stone-500">
        Answer accuracy holds when the critical span is retrieved and collapses toward chance
        when it isn’t; distractor-only context actively misleads (rising distractor-choice rate).
      </p>

      {/* Aggregate bars */}
      <div className="h-60 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
            <XAxis dataKey="short" tick={<ClassTick />} interval={0} />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tick={{ fontSize: 11, fill: "#78716c" }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
              formatter={(v, name) => [typeof v === "number" ? v.toFixed(3) : v, name]}
              labelFormatter={(l, p) =>
                `${meta.retrieval_trap_classes[p?.[0]?.payload?.class]?.label ?? l} · n=${
                  p?.[0]?.payload?.n ?? "–"
                }`
              }
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0.5} stroke="#a8a29e" strokeDasharray="4 3" label={{ value: "chance", position: "right", fontSize: 10, fill: "#a8a29e" }} />
            {closedBookMean != null && (
              <ReferenceLine
                y={closedBookMean}
                stroke="#c4b5a0"
                strokeDasharray="2 3"
                label={{ value: "closed-book avg", position: "insideTopRight", fontSize: 10, fill: "#a8998a" }}
              />
            )}
            <Bar dataKey="accuracy" name="Accuracy" fill={ACCENT} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="distractor" name="Distractor-choice rate" fill={RED} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Drill-down: class cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CLASS_ORDER.map((c) => {
          const cls = rt.by_class[c];
          const active = selectedClass === c;
          const color = TRAP_COLORS[c];
          return (
            <button
              key={c}
              type="button"
              onClick={() => setSelectedClass(active ? null : c)}
              title={meta.retrieval_trap_classes[c]?.desc}
              className={
                "rounded-md border p-2 text-left transition " +
                (active ? "border-transparent" : "border-stone-200 hover:border-stone-300")
              }
              style={active ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[11px] font-medium text-stone-700">
                  {meta.retrieval_trap_classes[c]?.label ?? c}
                </span>
              </div>
              <div className="mt-1 text-[11px] tabular-nums text-stone-500">
                acc <span className="font-semibold text-stone-700">{cls?.accuracy?.toFixed(2)}</span>
                {"  ·  "}dist <span className="font-semibold text-stone-700">{cls?.distractor_choice_rate?.toFixed(2)}</span>
              </div>
              <div className="text-[10px] text-stone-400">n={cls?.n_questions?.toLocaleString()}</div>
            </button>
          );
        })}
      </div>

      {/* Drill-down: questions in the selected class */}
      {selectedClass && (
        <div className="rounded-md border border-stone-200 bg-stone-50 p-2">
          <div className="mb-1 px-1 text-[11px] text-stone-500">
            Questions in{" "}
            <span className="font-medium" style={{ color: TRAP_COLORS[selectedClass] }}>
              {meta.retrieval_trap_classes[selectedClass]?.label}
            </span>{" "}
            <span className="text-stone-400">({configLabel})</span>
          </div>
          {(qByClass[selectedClass]?.length ?? 0) === 0 ? (
            <p className="px-1 py-2 text-[11px] text-stone-400">
              No questions in this class within the mock fixture — the bars above are corpus-level
              aggregates from the paper (n={rt.by_class[selectedClass]?.n_questions?.toLocaleString()}).
            </p>
          ) : (
            <ul className="space-y-1">
              {qByClass[selectedClass].map((qid) => {
                const q = questionsById.get(qid);
                const active = qid === selectedQuestionId;
                return (
                  <li key={qid}>
                    <button
                      type="button"
                      onClick={() => onSelectQuestion(qid)}
                      className={
                        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition " +
                        (active
                          ? "border-accent bg-accent-soft"
                          : "border-stone-200 bg-white hover:border-accent")
                      }
                    >
                      <span
                        className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-500"
                        title={qid}
                      >
                        {questionNumber(qid) ? `Q${questionNumber(qid)}` : qid}
                      </span>
                      <span className="line-clamp-1 text-stone-600">
                        {q ? textTitle(q.text_id, textGlosses) : qid}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
