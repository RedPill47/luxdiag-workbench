// One clear home for "use your own data": the two ways a visitor can run the
// workbench on their own input (paste a passage, or upload a full dataset),
// followed by the reuse/schema context and open-artifact links. This replaces
// the old split between a header "Try your own text" button and an "About" modal
// that hid the uploader.

import { useState } from "react";

function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function UseYourData({ about, data, question, onClose, onPastePassage, onLoadDataset }) {
  const [uploadError, setUploadError] = useState(null);
  if (!about) return null;

  // The example is a *different* study, on purpose: English encyclopedia text,
  // other retrievers, other QA LLMs, and an entity/discourse tagging task in
  // place of the Luxembourgish one. Uploading it shows the interface is a
  // reusable shell, not a viewer for our corpus. It is a static asset so it
  // works identically offline and on the deployed build.
  const [exampleBusy, setExampleBusy] = useState(false);
  async function fetchExample() {
    const r = await fetch("./data/example-bundle.json");
    if (!r.ok) throw new Error(`example-bundle.json (${r.status})`);
    return r.json();
  }
  async function loadExample() {
    setUploadError(null);
    setExampleBusy(true);
    try {
      const bundle = await fetchExample();
      onLoadDataset?.(bundle); // validates, swaps the app onto it, and closes
    } catch (err) {
      setUploadError(String(err.message || err));
    } finally {
      setExampleBusy(false);
    }
  }
  async function downloadExample() {
    setUploadError(null);
    setExampleBusy(true);
    try {
      download("luxdiag_example_miniwiki_en.json", await fetchExample());
    } catch (err) {
      setUploadError(`Could not fetch the example: ${err.message || err}`);
    } finally {
      setExampleBusy(false);
    }
  }

  function exportView() {
    if (!data || !question) return;
    const text = data.textsById.get(question.text_id);
    const answers = data.answers.filter((a) => a.question_id === question.question_id);
    const annotations = data.annotationsByText.get(question.text_id) ?? [];
    download(`luxdiag_${question.question_id}.json`, {
      _note: "Released data behind this view of the LuxDiag Workbench.",
      text,
      question,
      answers,
      annotations,
      meta: data.meta,
    });
  }

  function onFile(e) {
    setUploadError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let bundle;
      try {
        bundle = JSON.parse(reader.result);
      } catch {
        setUploadError("That file is not valid JSON.");
        return;
      }
      try {
        onLoadDataset?.(bundle); // throws on invalid schema; closes on success
      } catch (err) {
        setUploadError(String(err.message || err));
      }
    };
    reader.readAsText(file);
  }

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
            <h2 className="text-lg font-semibold text-stone-900">Use your own data</h2>
            <p className="mt-0.5 text-sm text-stone-500">
              This is a reusable framework, not a viewer for one dataset. Run it on your own input:
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

        <div className="space-y-5 px-6 py-5">
          {/* The two ways in — the primary actions, up top and unmissable. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col rounded-lg border border-stone-200 p-4">
              <div className="text-sm font-semibold text-stone-800">Paste a passage</div>
              <p className="mt-1 flex-1 text-xs text-stone-500">
                Paste any text and drive the coordinate overlays and the character-BM25 retriever on
                it. Quickest way to see the mechanics.
              </p>
              <button
                type="button"
                onClick={onPastePassage}
                className="mt-3 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
              >
                ✎ Open text playground
              </button>
            </div>

            <div className="flex flex-col rounded-lg border border-stone-200 p-4">
              <div className="text-sm font-semibold text-stone-800">Upload a dataset</div>
              <p className="mt-1 flex-1 text-xs text-stone-500">
                Upload one JSON bundle and every panel re-renders on your studies, in your browser.
                Or load the built-in example — a completely different study (English text, other
                retrievers and LLMs, an entity/discourse tagging task) that proves nothing here is
                specific to Luxembourgish.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90">
                  ↑ Upload .json
                  <input type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={loadExample}
                  disabled={exampleBusy}
                  className="rounded-md border border-accent px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent-soft disabled:opacity-50"
                >
                  {exampleBusy ? "Loading…" : "▶ Load English example"}
                </button>
                <button
                  type="button"
                  onClick={downloadExample}
                  disabled={exampleBusy}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400 disabled:opacity-50"
                >
                  ↓ Download it
                </button>
              </div>
              {uploadError && (
                <p className="mt-2 text-xs text-[color:var(--color-trap-distractor)]">
                  Could not load: {uploadError}
                </p>
              )}
            </div>
          </div>

          {/* Why it works — the reuse/schema context, secondary. */}
          <details className="rounded-lg border border-stone-200">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-stone-700">
              How it works &amp; the data schema
            </summary>
            <div className="space-y-3 border-t border-stone-100 px-4 py-3">
              <p className="text-sm leading-relaxed text-stone-600">{about.intro}</p>
              {about.reuse && (
                <ul className="space-y-1 text-sm text-stone-600">
                  {about.reuse.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-stone-300">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              )}
              {about.schema && (
                <div className="overflow-hidden rounded-lg border border-stone-200">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-stone-100">
                      {about.schema.map((s) => (
                        <tr key={s.file}>
                          <td className="whitespace-nowrap px-3 py-1.5 align-top font-mono text-stone-600">
                            {s.file}
                          </td>
                          <td className="px-3 py-1.5 text-stone-500">{s.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>

          {/* Open artifacts + provenance. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              onClick={exportView}
              disabled={!question}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400 disabled:opacity-50"
            >
              ↓ Data behind this view
            </button>
            {about.links?.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
          {about.licensing && <p className="text-xs text-stone-400">{about.licensing}</p>}
        </div>
      </div>
    </div>
  );
}
