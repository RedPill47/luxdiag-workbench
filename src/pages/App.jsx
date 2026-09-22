import { useEffect, useMemo, useState } from "react";
import { loadData, loadDataFromBundle } from "../lib/dataLoader.js";
import { buildPassageOverlays, categoryToggles } from "../lib/overlays.js";
import PassageView from "../components/PassageView.jsx";
import QuestionPicker from "../components/QuestionPicker.jsx";
import RetrievalPanel from "../components/RetrievalPanel.jsx";
import AnsweringPanel from "../components/AnsweringPanel.jsx";
import RetrievalTrapExplorer from "../components/RetrievalTrapExplorer.jsx";
import AnnotationPanel from "../components/AnnotationPanel.jsx";
import Onboarding from "../components/Onboarding.jsx";
import Home from "../components/Home.jsx";
import GuideCard from "../components/GuideCard.jsx";
import Glossary from "../components/Glossary.jsx";
import Playground from "../components/Playground.jsx";
import UseYourData from "../components/UseYourData.jsx";
import { questionLabel } from "../lib/labels.js";

const K_OPTIONS = [1, 3, 5, 10];
const VALID_TABS = ["retrieval", "answering", "trap", "annotation"];

// Read shareable view state from the URL so a copied link reproduces the exact
// diagnostic view (the paper's "reproducible URL state").
function readUrlState() {
  const p = new URLSearchParams(window.location.search);
  const sel = {};
  if (p.get("q")) sel.question_id = p.get("q");
  if (p.get("r")) sel.retriever = p.get("r");
  if (p.get("s")) sel.setting = p.get("s");
  if (p.get("k") && K_OPTIONS.includes(Number(p.get("k")))) sel.k = Number(p.get("k"));
  const tab = VALID_TABS.includes(p.get("tab")) ? p.get("tab") : null;
  const mode = p.get("mode") === "playground" ? "playground" : null;
  return { sel, tab, mode };
}

const INTRO_SEEN_KEY = "luxdiag_intro_seen_v1";

// A shared link encodes a specific view, so it must open on that view rather
// than on the landing page. Evaluated once at module load, before the
// URL-mirroring effect below starts adding parameters of its own.
const ARRIVED_ON_DEEP_LINK = ["q", "r", "s", "k", "tab", "mode"].some((key) =>
  new URLSearchParams(window.location.search).has(key)
);

const PANEL_TABS = [
  { id: "retrieval", label: "Retrieval" },
  { id: "answering", label: "Answering" },
  { id: "trap", label: "Retrieval-trap" },
  { id: "annotation", label: "Annotation" },
];

// The single selection object that drives every panel (brief §3.1). Panels
// are pure functions of this + the loaded data.
const DEFAULT_SELECTION = {
  question_id: null,
  retriever: "hybrid_w_char",
  setting: "open_corpus",
  k: 5,
  visible_overlays: { critical: true, distractor: true, categories: new Set() },
};

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selection, setSelection] = useState(() => ({
    ...DEFAULT_SELECTION,
    ...readUrlState().sel,
  }));
  const [flash, setFlash] = useState(null); // transient: chunk clicked → passage range
  const [pendingFlash, setPendingFlash] = useState(null); // cross-text jump: chunk to flash once its text loads
  const [annot, setAnnot] = useState(null); // annotation cell clicked → highlighted occurrences
  const [activeTab, setActiveTab] = useState(() => readUrlState().tab ?? "retrieval");
  const [showIntro, setShowIntro] = useState(false);
  const [caseIndex, setCaseIndex] = useState(null); // index into guide.featured, or null
  const [glossary, setGlossary] = useState(null); // {focus: term|null} when open, else null
  const [mode, setMode] = useState(() => readUrlState().mode ?? "studies"); // "studies" | "playground"
  const [showUseData, setShowUseData] = useState(false);
  // "home" = the landing page; "tool" = the workbench itself.
  const [view, setView] = useState(() => (ARRIVED_ON_DEEP_LINK ? "tool" : "home"));

  const openGlossary = (focus = null) => setGlossary({ focus });

  useEffect(() => {
    loadData()
      .then((d) => {
        setData(d);
        // Keep valid URL-provided state; fall back to defaults otherwise.
        setSelection((s) => ({
          ...s,
          question_id:
            s.question_id && d.questionsById.has(s.question_id)
              ? s.question_id
              : d.questions[0]?.question_id ?? null,
          retriever: d.meta.retrievers?.[s.retriever] ? s.retriever : DEFAULT_SELECTION.retriever,
          setting: d.meta.settings?.[s.setting] ? s.setting : DEFAULT_SELECTION.setting,
        }));
        // Show onboarding on first visit if a guide is present.
        if (
          d.guide &&
          ARRIVED_ON_DEEP_LINK &&
          !localStorage.getItem(INTRO_SEEN_KEY)
        )
          setShowIntro(true);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Mirror the shareable view state into the URL (replaceState = no history spam).
  useEffect(() => {
    if (!data) return;
    // Don't write view state while the landing page is showing: a reload there
    // should stay on the landing page, not jump into the tool.
    if (view === "home") return;
    const p = new URLSearchParams();
    if (selection.question_id) p.set("q", selection.question_id);
    p.set("r", selection.retriever);
    p.set("s", selection.setting);
    p.set("k", String(selection.k));
    p.set("tab", activeTab);
    if (mode !== "studies") p.set("mode", mode);
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [data, view, selection.question_id, selection.retriever, selection.setting, selection.k, activeTab, mode]);

  const featured = data?.guide?.featured ?? [];
  const activeCase = caseIndex != null ? featured[caseIndex] ?? null : null;

  function dismissIntro() {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
    setShowIntro(false);
  }

  // Apply a guided case: drive the global selection + tab to its preset state.
  function applyCase(idx) {
    const c = featured[idx];
    if (!c) return;
    const sel = c.selection || {};
    setSelection((s) => ({
      ...s,
      question_id: sel.question_id ?? s.question_id,
      retriever: sel.retriever ?? s.retriever,
      setting: sel.setting ?? s.setting,
      k: sel.k ?? s.k,
    }));
    if (sel.tab) setActiveTab(sel.tab);
    setCaseIndex(idx);
  }

  function launchCase(c) {
    const idx = featured.findIndex((f) => f.id === c.id);
    if (idx < 0) return;
    dismissIntro();
    applyCase(idx);
  }

  const patch = (fields) => setSelection((s) => ({ ...s, ...fields }));

  const question =
    data && selection.question_id ? data.questionsById.get(selection.question_id) : null;
  const text = question ? data.textsById.get(question.text_id) : null;

  const overlays = useMemo(() => {
    if (!question || !data) return [];
    return buildPassageOverlays({
      question,
      annotationRows: data.annotationsByText.get(question.text_id) ?? [],
      meta: data.meta,
    });
  }, [question, data]);

  // On question change, default every present overlay ON so the wiring is
  // visible; the user can toggle any off. Also clear any stale chunk flash.
  useEffect(() => {
    setSelection((s) => ({
      ...s,
      visible_overlays: {
        critical: true,
        distractor: true,
        categories: new Set(categoryToggles(overlays).map((c) => c.category)),
      },
    }));
    setFlash(null);
    setAnnot(null);
  }, [overlays]);

  // After a cross-text jump, the effect above cleared the flash on the way in.
  // Once the passage for the target text is on screen, apply the queued flash.
  // Declared after that effect so it runs second within the same commit.
  useEffect(() => {
    if (!pendingFlash || !question || !data) return;
    const chunk = data.chunksById.get(pendingFlash.chunk_id);
    if (chunk && chunk.text_id === question.text_id) {
      setFlash({ start: chunk.start, end: chunk.end, nonce: Date.now() });
      setPendingFlash(null);
    }
  }, [pendingFlash, question, data]);

  function handleChunkClick(rankedChunk) {
    const chunk = data.chunksById.get(rankedChunk.chunk_id);
    if (!chunk || !question || chunk.text_id !== question.text_id) return; // cross-text: nothing to flash here
    setFlash({ start: chunk.start, end: chunk.end, nonce: Date.now() });
  }

  // Live retrieval spans the whole corpus, so a hit may live in another text.
  // Same-text: flash in place. Cross-text: jump to that text (via its first
  // question) and flash the chunk once the passage loads.
  function handleLiveChunkClick(rankedChunk) {
    const chunk = data.chunksById.get(rankedChunk.chunk_id);
    if (!chunk || !question) return;
    if (chunk.text_id === question.text_id) {
      setFlash({ start: chunk.start, end: chunk.end, nonce: Date.now() });
      return;
    }
    const target = data.questionsByText.get(chunk.text_id)?.[0];
    if (!target) return;
    setPendingFlash({ chunk_id: chunk.chunk_id });
    patch({ question_id: target.question_id });
  }

  function handleCellClick(category, annotator, ranges) {
    setAnnot((a) =>
      a && a.category === category && a.annotator === annotator
        ? null // clicking the active cell again clears the highlight
        : { category, annotator, ranges, nonce: Date.now() }
    );
  }

  function handleToggle(kind, id) {
    setSelection((s) => {
      const vo = s.visible_overlays;
      if (kind === "critical") return { ...s, visible_overlays: { ...vo, critical: !vo.critical } };
      if (kind === "distractor")
        return { ...s, visible_overlays: { ...vo, distractor: !vo.distractor } };
      if (kind === "category") {
        const categories = new Set(vo.categories);
        categories.has(id) ? categories.delete(id) : categories.add(id);
        return { ...s, visible_overlays: { ...vo, categories } };
      }
      return s;
    });
  }

  // Load a reviewer-uploaded dataset bundle (throws on invalid schema; About
  // catches and shows the message). Swaps the whole app onto their data.
  function loadCustomDataset(bundle) {
    const d = loadDataFromBundle(bundle);
    const firstOf = (obj, fallback) => (obj?.[fallback] ? fallback : Object.keys(obj ?? {})[0] ?? fallback);
    setData(d);
    setSelection({
      ...DEFAULT_SELECTION,
      question_id: d.questions[0]?.question_id ?? null,
      retriever: firstOf(d.meta.retrievers, DEFAULT_SELECTION.retriever),
      setting: firstOf(d.meta.settings, DEFAULT_SELECTION.setting),
    });
    setCaseIndex(null);
    setMode("studies");
    setActiveTab("retrieval");
    setShowUseData(false);
  }

  function resetDataset() {
    loadData().then((d) => {
      setData(d);
      setSelection((s) => ({ ...s, question_id: d.questions[0]?.question_id ?? null }));
      setCaseIndex(null);
      setActiveTab("retrieval");
    });
  }

  const meta = data?.meta;

  function enterTool() {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
    setView("tool");
  }

  if (view === "home") {
    return (
      <>
        {glossary && (
          <Glossary
            meta={data?.meta}
            glossary={data?.guide?.glossary}
            focusKey={glossary.focus}
            onClose={() => setGlossary(null)}
          />
        )}
        {showUseData && (
          <UseYourData
            about={data?.guide?.about}
            data={data}
            question={question}
            onClose={() => setShowUseData(false)}
            onPastePassage={() => {
              setMode("playground");
              setShowUseData(false);
              enterTool();
            }}
            onLoadDataset={(...args) => {
              loadCustomDataset(...args);
              enterTool();
            }}
          />
        )}
        <Home
          data={data}
          onEnter={enterTool}
          onTour={() => {
            enterTool();
            setMode("studies");
            applyCase(0);
          }}
          onUseYourData={() => setShowUseData(true)}
          onGlossary={() => openGlossary(null)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen">
      {showIntro && (
        <Onboarding
          guide={data?.guide}
          onClose={dismissIntro}
          onLaunchCase={launchCase}
        />
      )}
      {glossary && (
        <Glossary
          meta={data?.meta}
          glossary={data?.guide?.glossary}
          focusKey={glossary.focus}
          onClose={() => setGlossary(null)}
        />
      )}
      {showUseData && (
        <UseYourData
          about={data?.guide?.about}
          data={data}
          question={question}
          onClose={() => setShowUseData(false)}
          onPastePassage={() => {
            setMode("playground");
            setShowUseData(false);
          }}
          onLoadDataset={loadCustomDataset}
        />
      )}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[100rem] items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-stone-900">
              <button
                type="button"
                onClick={() => setView("home")}
                title="Back to the overview: what this is, who it is for, what it does"
                className="text-left transition hover:text-accent"
              >
                LuxDiag Workbench
              </button>
            </h1>
            <p className="text-sm text-stone-500">
              Diagnostic RAG &amp; annotation explorer over LuxDiagRC{" "}
              <button
                type="button"
                onClick={() => setView("home")}
                className="text-accent underline underline-offset-2 hover:text-stone-700"
              >
                overview
              </button>
            </p>
          </div>
          {data?.guide && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/* Primary actions: see it, then try it on your own data. */}
              <button
                type="button"
                onClick={() => {
                  setMode("studies");
                  applyCase(0);
                }}
                title="A short guided walkthrough of the key findings"
                className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700"
              >
                ▸ Guided tour
              </button>
              {data.guide?.about && (
                <button
                  type="button"
                  onClick={() => setShowUseData(true)}
                  title="Paste your own passage, or upload your own dataset"
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
                >
                  ✎ Use your own data
                </button>
              )}

              <span className="mx-0.5 h-5 w-px bg-stone-200" aria-hidden="true" />

              {/* Reference: look up a term, or read what this is. */}
              {data.guide?.glossary && (
                <button
                  type="button"
                  onClick={() => openGlossary(null)}
                  title="Definitions of every term, with examples"
                  className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
                >
                  📖 Glossary
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowIntro(true)}
                title="What is this? How to use it"
                className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
              >
                ? Help
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[100rem] px-6 py-6">
        {error && (
          <p className="text-sm text-[color:var(--color-trap-distractor)]">
            Failed to load data: {error}
          </p>
        )}
        {!data && !error && <p className="text-sm text-stone-500">Loading…</p>}

        {data?.custom && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2 text-xs">
            <span className="text-stone-700">
              Running on an <span className="font-semibold">uploaded dataset</span> —{" "}
              {data.questions.length} questions over {data.texts.length} texts. Every panel is
              rendering your data, not LuxDiagRC.
            </span>
            <button
              type="button"
              onClick={resetDataset}
              className="shrink-0 rounded-md border border-stone-300 bg-white px-2.5 py-1 font-medium text-stone-600 transition hover:border-stone-400"
            >
              ↺ Reset to LuxDiagRC
            </button>
          </div>
        )}

        {data && mode === "playground" && <Playground onExit={() => setMode("studies")} />}

        {data && mode === "studies" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
            {/* Left sidebar: question picker (drives global selection) */}
            <div className="xl:sticky xl:top-6 xl:h-[calc(100vh-7rem)]">
              <QuestionPicker
                questions={data.questions}
                meta={meta}
                selectedId={selection.question_id}
                onSelect={(id) => patch({ question_id: id })}
                onTermClick={data.guide?.glossary ? openGlossary : undefined}
                textGlosses={data.guide?.text_glosses}
              />
            </div>

            {/* Main: passage (persistent) + panels */}
            {question ? (
              <div className="min-w-0 space-y-3">
                <SelectionBar
                  selection={selection}
                  meta={meta}
                  question={question}
                  textGlosses={data.guide?.text_glosses}
                />

                {activeCase && (
                  <GuideCard
                    activeCase={activeCase}
                    index={caseIndex}
                    total={featured.length}
                    onPrev={() => applyCase(caseIndex - 1)}
                    onNext={() => applyCase(caseIndex + 1)}
                    onClose={() => setCaseIndex(null)}
                  />
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <PassageView
                      title={text?.title ?? question.text_id}
                      text={text?.clean_text ?? ""}
                      overlays={overlays}
                      visible={selection.visible_overlays}
                      onToggle={handleToggle}
                      flash={flash}
                      annot={annot}
                    />

                    <div className="rounded-lg border border-stone-200 bg-white px-5 py-4">
                      {data.guide?.text_glosses?.[question.text_id] && (
                        <p className="mb-2 text-xs text-stone-400">
                          <span className="uppercase tracking-wide">Text (EN)</span>{" "}
                          <span className="text-stone-500">
                            {data.guide.text_glosses[question.text_id].title_en}
                            {data.guide.text_glosses[question.text_id].summary_en
                              ? ` — ${data.guide.text_glosses[question.text_id].summary_en}`
                              : ""}
                          </span>
                        </p>
                      )}
                      <p className="text-sm font-medium text-stone-800">{question.question}</p>
                      <ol className="mt-2 space-y-1 text-sm text-stone-600">
                        {question.options.map((opt, i) => (
                          <li
                            key={i}
                            className={
                              i === question.gold_option_index
                                ? "font-medium text-[color:var(--color-trap-critical)]"
                                : ""
                            }
                          >
                            {String.fromCharCode(65 + i)}. {opt}
                            {i === question.gold_option_index && " ✓"}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  {/* Panels column (Trap · Annotation land in steps 5–6) */}
                  <div className="min-w-0">
                    <TabBar tabs={PANEL_TABS} active={activeTab} onChange={setActiveTab} />
                    <div className="pt-3">
                      {activeTab === "retrieval" && (
                        <RetrievalPanel
                          selection={selection}
                          question={question}
                          meta={meta}
                          chunksById={data.chunksById}
                          aggregates={data.aggregates}
                          onPatch={patch}
                          onChunkClick={handleChunkClick}
                          onLiveChunkClick={handleLiveChunkClick}
                          retrievalMemory={data.retrievalMemory}
                          custom={data.custom}
                        />
                      )}
                      {activeTab === "answering" && (
                        <AnsweringPanel
                          question={question}
                          meta={meta}
                          answersByQMS={data.answersByQMS}
                          selection={selection}
                        />
                      )}
                      {activeTab === "trap" && (
                        <RetrievalTrapExplorer
                          aggregates={data.aggregates}
                          meta={meta}
                          answers={data.answers}
                          questionsById={data.questionsById}
                          selectedQuestionId={selection.question_id}
                          onSelectQuestion={(id) => patch({ question_id: id })}
                          textGlosses={data.guide?.text_glosses}
                        />
                      )}
                      {activeTab === "annotation" && (
                        <AnnotationPanel
                          textId={question.text_id}
                          annotationRows={data.annotationsByText.get(question.text_id) ?? []}
                          meta={meta}
                          aggregates={data.aggregates}
                          activeCell={annot ? { category: annot.category, annotator: annot.annotator } : null}
                          onCellClick={handleCellClick}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-400">Select a question to begin.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-stone-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={t.disabled}
          onClick={() => !t.disabled && onChange(t.id)}
          className={
            "relative px-3 py-2 text-xs font-medium transition " +
            (t.disabled
              ? "cursor-not-allowed text-stone-300"
              : active === t.id
                ? "text-accent"
                : "text-stone-500 hover:text-stone-800")
          }
        >
          {t.label}
          {active === t.id && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
          )}
        </button>
      ))}
    </div>
  );
}

// Compact read-only summary of the global selection, shown so the shared
// state is visible and every panel reads from one source. The interactive
// retriever / setting / k controls live in the RetrievalPanel.
function SelectionBar({ selection, meta, question, textGlosses }) {
  const [copied, setCopied] = useState(false);
  const items = [
    { label: "Question", value: questionLabel(question, textGlosses) },
    { label: "Retriever", value: meta.retrievers?.[selection.retriever]?.label ?? selection.retriever },
    { label: "Setting", value: meta.settings?.[selection.setting]?.label ?? selection.setting },
    { label: "k", value: selection.k },
  ];
  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="uppercase tracking-wide text-stone-400">{it.label}</span>
          <span className="font-medium text-stone-700">{it.value}</span>
        </span>
      ))}
      <button
        type="button"
        onClick={copyLink}
        title="Copy a link that reopens this exact view"
        className="ml-auto rounded-md border border-stone-300 px-2 py-0.5 text-[11px] font-medium text-stone-600 transition hover:border-accent hover:text-accent"
      >
        {copied ? "✓ Copied" : "🔗 Copy link to this view"}
      </button>
    </div>
  );
}
