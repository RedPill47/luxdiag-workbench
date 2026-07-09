import { useMemo, useState } from "react";
import { textTitle, questionNumber } from "../lib/labels.js";

// Filter + select a question. Filters are local UI state; the chosen
// question_id is lifted to the global selection in App.
export default function QuestionPicker({
  questions,
  meta,
  selectedId,
  onSelect,
  onTermClick,
  textGlosses,
}) {
  const titleOf = (tid) => textTitle(tid, textGlosses);
  // Tags sit inside the clickable question row, so a term click must not also
  // select the question (stopPropagation) and the span must not be a <button>.
  const termProps = (key) =>
    onTermClick
      ? {
          role: "button",
          tabIndex: 0,
          onClick: (e) => {
            e.stopPropagation();
            onTermClick(key);
          },
          className:
            "cursor-pointer rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 underline decoration-dotted underline-offset-2 hover:bg-accent-soft hover:text-accent",
        }
      : { className: "rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500" };

  const [textId, setTextId] = useState("");
  const [cognitiveType, setCognitiveType] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");

  const textIds = useMemo(
    () => [...new Set(questions.map((q) => q.text_id))].sort(),
    [questions]
  );

  const filtered = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return questions.filter((q) => {
      if (textId && q.text_id !== textId) return false;
      if (cognitiveType && q.cognitive_type !== cognitiveType) return false;
      if (category && !(q.linguistic_categories ?? []).includes(category)) return false;
      if (
        ql &&
        !q.question.toLowerCase().includes(ql) &&
        !q.question_id.toLowerCase().includes(ql) &&
        !titleOf(q.text_id).toLowerCase().includes(ql)
      )
        return false;
      return true;
    });
  }, [questions, textId, cognitiveType, category, query]);

  const field =
    "w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-xs " +
    "focus:border-accent focus:outline-none";

  return (
    <aside className="flex h-full flex-col rounded-lg border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-stone-900">Questions</h2>
          <span className="text-xs text-stone-400">
            {filtered.length}/{questions.length}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          <input
            className={field}
            placeholder="Search by story title or text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className={field} value={textId} onChange={(e) => setTextId(e.target.value)}>
            <option value="">All stories (16)</option>
            {textIds.map((t) => (
              <option key={t} value={t}>
                {titleOf(t)}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={cognitiveType}
            onChange={(e) => setCognitiveType(e.target.value)}
          >
            <option value="">All cognitive types</option>
            {Object.entries(meta.cognitive_types ?? {}).map(([k, v]) => (
              <option key={k} value={k} title={v.desc}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {Object.entries(meta.categories ?? {}).map(([k, v]) => (
              <option key={k} value={k} title={v.desc}>
                {v.label}
                {v.excluded ? " (excl.)" : ""}
              </option>
            ))}
          </select>
          {(textId || cognitiveType || category || query) && (
            <button
              type="button"
              onClick={() => {
                setTextId("");
                setCognitiveType("");
                setCategory("");
                setQuery("");
              }}
              className="text-xs text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {onTermClick && (
        <p className="border-b border-stone-100 bg-stone-50 px-4 py-1.5 text-[11px] text-stone-500">
          Each question is tagged with its linguistic phenomena.{" "}
          <button
            type="button"
            onClick={() => onTermClick(null)}
            className="font-medium text-accent underline decoration-dotted underline-offset-2 hover:no-underline"
          >
            Click a tag, or open the Glossary
          </button>{" "}
          for a definition.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-stone-400">No questions match.</p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((q) => {
              const active = q.question_id === selectedId;
              return (
                <li key={q.question_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(q.question_id)}
                    className={
                      "w-full rounded-md border px-3 py-2 text-left transition " +
                      (active
                        ? "border-accent bg-accent-soft"
                        : "border-transparent hover:bg-stone-50")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-500">
                        {questionNumber(q.question_id) ? `Q${questionNumber(q.question_id)}` : q.question_id}
                      </span>
                      <span
                        className="truncate text-[11px] font-medium text-stone-600"
                        title={q.question_id}
                      >
                        {titleOf(q.text_id)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-stone-700">{q.question}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span
                        {...termProps(q.cognitive_type)}
                        title={meta.cognitive_types?.[q.cognitive_type]?.desc}
                      >
                        {meta.cognitive_types?.[q.cognitive_type]?.label ?? q.cognitive_type}
                      </span>
                      {(q.linguistic_categories ?? []).map((c) => (
                        <span key={c} {...termProps(c)} title={meta.categories?.[c]?.desc}>
                          {meta.categories?.[c]?.label ?? c}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
