// Reviewer onboarding (brief: the demo must be self-explanatory to someone who
// does not read Luxembourgish and has not read the paper). Shows on first load,
// reopenable via the header "?" button. Renders the plain-English intro plus the
// one-click guided cases that land the visitor in a real, explained state.

export default function Onboarding({ guide, onClose, onLaunchCase }) {
  if (!guide) return null;
  const { intro, featured = [] } = guide;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-2xl rounded-xl border border-stone-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{intro.title}</h2>
            <p className="mt-0.5 text-sm text-stone-500">{intro.tagline}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {intro.paragraphs.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-stone-700">
              {p}
            </p>
          ))}

          {intro.how_to_read && (
            <div className="rounded-lg bg-stone-50 px-4 py-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
                How to read the highlights
              </div>
              <ul className="space-y-1 text-sm text-stone-600">
                {intro.how_to_read.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-stone-300">•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {featured.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                Start with a guided example
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {featured.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onLaunchCase(c)}
                    className="rounded-lg border border-stone-200 px-4 py-3 text-left transition hover:border-accent hover:bg-accent-soft"
                  >
                    <div className="text-sm font-medium text-stone-800">{c.title}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{c.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-stone-200 px-6 py-3">
          <p className="text-xs text-stone-400">
            Reopen this anytime with “? Help”, or look up any term with “📖 Glossary”, top right.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
          >
            Explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}
