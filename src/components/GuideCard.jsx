// The explanation card shown while a guided case is active. Tells the reviewer,
// in plain English, what they are looking at and what to look for — including a
// gloss of the Luxembourgish question so the passage is not a black box.

export default function GuideCard({ activeCase, index, total, onPrev, onNext, onClose }) {
  if (!activeCase) return null;
  const { title, gloss, look_for = [] } = activeCase;

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Guided example
          </span>
          <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-1.5 text-xs text-stone-400 hover:bg-white hover:text-stone-700"
          aria-label="Exit guided example"
        >
          Exit ✕
        </button>
      </div>

      {gloss && (
        <div className="mt-2 space-y-0.5 text-xs text-stone-600">
          {gloss.question_en && (
            <p>
              <span className="font-medium text-stone-500">Question (EN): </span>
              {gloss.question_en}
            </p>
          )}
          {gloss.answer_en && <p>{gloss.answer_en}</p>}
          {gloss.evidence_en && <p className="text-stone-500">{gloss.evidence_en}</p>}
          {gloss.note_en && <p className="text-stone-500">{gloss.note_en}</p>}
        </div>
      )}

      <ol className="mt-2 space-y-1">
        {look_for.map((s, i) => (
          <li key={i} className="flex gap-2 text-xs text-stone-700">
            <span className="font-mono text-accent">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center gap-2 border-t border-accent/20 pt-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={index <= 0}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 transition hover:border-stone-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={index >= total - 1}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 transition hover:border-stone-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
        <span className="ml-auto text-[11px] text-stone-400">
          Example {index + 1} of {total}
        </span>
      </div>
    </div>
  );
}
