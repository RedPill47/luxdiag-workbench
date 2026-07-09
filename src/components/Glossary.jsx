// Click-to-reveal reference. Every jargon term (linguistic phenomenon, setting,
// retrieval-trap class, question type) is an expandable row: click to reveal a
// detailed definition and an example. Opened from the header, or focused on a
// specific term when a tag elsewhere is clicked. Label + one-line summary come
// from meta; the longer detail + example come from guide.glossary.

import { useEffect, useRef, useState } from "react";

function labelFor(meta, key) {
  return (
    meta.categories?.[key]?.label ??
    meta.settings?.[key]?.label ??
    meta.retrieval_trap_classes?.[key]?.label ??
    meta.cognitive_types?.[key]?.label ??
    key
  );
}
function shortFor(meta, key) {
  return (
    meta.categories?.[key]?.desc ??
    meta.settings?.[key]?.desc ??
    meta.retrieval_trap_classes?.[key]?.desc ??
    meta.cognitive_types?.[key]?.desc
  );
}

export default function Glossary({ meta, glossary, focusKey, onClose }) {
  const [open, setOpen] = useState(focusKey ?? null);
  const focusRef = useRef(null);

  // Re-focus when reopened on a different term, and scroll it into view.
  useEffect(() => {
    setOpen(focusKey ?? null);
  }, [focusKey]);
  useEffect(() => {
    if (open && focusRef.current) focusRef.current.scrollIntoView({ block: "nearest" });
  }, [open]);

  if (!glossary) return null;
  const details = glossary.details ?? {};

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
            <h2 className="text-lg font-semibold text-stone-900">Reference glossary</h2>
            <p className="mt-0.5 text-sm text-stone-500">
              Click any term to reveal a detailed definition and an example.
            </p>
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

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {glossary.groups.map((grp) => (
            <div key={grp.title}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
                {grp.title}
              </div>
              <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                {grp.keys.map((key) => {
                  const isOpen = open === key;
                  const d = details[key] ?? {};
                  return (
                    <div key={key} ref={isOpen ? focusRef : null}>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : key)}
                        className={
                          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition " +
                          (isOpen ? "bg-accent-soft" : "hover:bg-stone-50")
                        }
                      >
                        <span className="text-sm font-medium text-stone-800">
                          {labelFor(meta, key)}
                        </span>
                        <span className="shrink-0 text-xs text-stone-400">{isOpen ? "−" : "+"}</span>
                      </button>
                      {isOpen && (
                        <div className="space-y-2 px-3 pb-3 pt-0.5 text-sm text-stone-600">
                          {shortFor(meta, key) && (
                            <p className="text-stone-500">{shortFor(meta, key)}</p>
                          )}
                          {d.detail && <p className="leading-relaxed">{d.detail}</p>}
                          {(d.example_lb || d.example_en) && (
                            <div className="rounded-md bg-stone-50 px-3 py-2 text-xs">
                              <span className="font-medium text-stone-400">Example: </span>
                              {d.example_lb && <span className="text-stone-700">{d.example_lb}</span>}
                              {d.example_en && (
                                <span className="text-stone-500"> — {d.example_en}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
