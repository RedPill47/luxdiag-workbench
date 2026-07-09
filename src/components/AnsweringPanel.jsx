import { TRAP_COLORS } from "../lib/palette.js";

const SETTINGS = ["closed_book", "full_text_oracle", "rag_text_restricted", "rag_open_corpus"];
const CORRECT = "#2f8a5b";
const WRONG = "#c0453b";
const letter = (i) => (i == null ? "–" : String.fromCharCode(65 + i));

// Pick the answer entry for a cell. For RAG settings prefer the one matching
// the current retriever/k; fall back to whatever exists and flag the mismatch.
function pickAnswer(entries, setting, selection) {
  if (!entries || entries.length === 0) return { entry: null, matches: true };
  if (!setting.startsWith("rag_")) return { entry: entries[0], matches: true };
  const exact = entries.find(
    (e) => e.retriever === selection.retriever && e.k === selection.k
  );
  return { entry: exact ?? entries[0], matches: !!exact };
}

function Cell({ entry, matches, setting, gold, trapClasses }) {
  if (!entry) return <td className="px-2 py-2 text-center text-stone-300">–</td>;
  const isRag = setting.startsWith("rag_");
  const ok = entry.correct;
  const color = ok ? CORRECT : WRONG;
  const trap = entry.retrieval_trap_class;

  return (
    <td className="px-2 py-2 align-top">
      <div className="flex flex-col items-center gap-1">
        <span
          title={ok ? `Correct (${letter(entry.predicted_option_index)})` : `Wrong: picked ${letter(entry.predicted_option_index)}, gold ${letter(gold)}`}
          className="inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border px-1.5 text-sm font-semibold tabular-nums"
          style={{ color, borderColor: color, backgroundColor: `${color}14` }}
        >
          {letter(entry.predicted_option_index)}
          <span className="text-[10px]">{ok ? "✓" : "✗"}</span>
        </span>

        {isRag && trap && (
          <span
            title={`${trapClasses?.[trap]?.desc ? trapClasses[trap].desc + "\n" : ""}Retrieval trap: ${trap} · @ ${entry.retriever} · k=${entry.k}${matches ? "" : " (differs from current selection)"}`}
            className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            style={{
              color: TRAP_COLORS[trap],
              backgroundColor: `${TRAP_COLORS[trap]}1f`,
              opacity: matches ? 1 : 0.5,
            }}
          >
            {trap.replace("_", " ")}
            {!matches && " *"}
          </span>
        )}
      </div>
    </td>
  );
}

export default function AnsweringPanel({ question, meta, answersByQMS, selection }) {
  const gold = question.gold_option_index;
  const models = Object.keys(meta.models ?? {});
  let anyMismatch = false;

  if (models.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">Answering</h2>
        <p className="mt-2 text-xs text-stone-400">
          This dataset doesn't define any models (<code>meta.models</code>), so there are no
          model answers to show.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-stone-900">Answering</h2>
        <span className="text-xs text-stone-500">
          Gold:{" "}
          <span className="font-semibold text-[color:var(--color-trap-critical)]">
            {letter(gold)}
          </span>{" "}
          <span className="text-stone-400">{question.options[gold]}</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-stone-500">
              <th className="px-2 py-1.5 text-left font-medium">Model</th>
              {SETTINGS.map((s) => (
                <th key={s} className="px-2 py-1.5 text-center font-medium">
                  {meta.settings?.[s]?.label ?? s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m} className="border-t border-stone-100">
                <td className="whitespace-nowrap px-2 py-2 font-medium text-stone-700">
                  {meta.models[m].label}
                </td>
                {SETTINGS.map((s) => {
                  const { entry, matches } = pickAnswer(
                    answersByQMS.get(`${question.question_id}|${m}|${s}`),
                    s,
                    selection
                  );
                  if (entry && !matches) anyMismatch = true;
                  return (
                    <Cell
                      key={s}
                      entry={entry}
                      matches={matches}
                      setting={s}
                      gold={gold}
                      trapClasses={meta.retrieval_trap_classes}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-stone-400">
        Trap badge shows what the retrieved context contained (colour = class). Pairing it
        with a ✗ surfaces the “useful evidence retrieved, still wrong” case.
        {anyMismatch && " * badge computed at a retriever/k differing from the current selection."}
      </p>
    </section>
  );
}
