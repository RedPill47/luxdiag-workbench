// Landing page. The workbench opens here rather than dropping a first-time
// visitor straight into four dense panels: it says what the tool is, what it
// deliberately is not, who it serves, and what every feature does. A visitor
// arriving on a shared deep link skips it (App.jsx), so reproducible URLs still
// land on the exact view they encode.

function Stat({ value, label }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="text-xl font-semibold tabular-nums text-stone-900">{value}</div>
      <div className="mt-0.5 text-xs text-stone-500">{label}</div>
    </div>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <section className="border-t border-stone-200 py-10">
      {eyebrow && (
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">
          {eyebrow}
        </div>
      )}
      <h2 className="text-xl font-semibold tracking-tight text-stone-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const AUDIENCES = [
  ["Low-resource NLP researchers",
   "Reuse an annotated corpus past the study that produced it. Every text carries two independent studies you can read against each other."],
  ["RAG and attribution researchers",
   "See which evidence actually reached the model, and which answer followed. Retrieval traps are inspectable per answer, not just in aggregate."],
  ["Reviewers and readers auditing a claim",
   "Go from a number in a table to the individual questions behind it, then share the exact view as a link."],
  ["Educators and students",
   "A concrete way to teach diagnostic error analysis over a morphologically rich language, with every technical term glossed in English."],
];

const PANELS = [
  ["Retrieval", "Ranked chunks for the selected question, each flagged when it carries correct or misleading evidence, with recall statistics and a corpus recall curve."],
  ["Answering", "How four LLMs answered under four conditions, from closed-book to full-text oracle, each answer badged by what retrieval had supplied."],
  ["Retrieval-trap", "Accuracy grouped by what the retriever surfaced, drilling from each group down to the individual questions in it."],
  ["Annotation", "An 11-category by 7-system matrix of token-level annotation; click a cell to highlight what that system matched, missed, or invented."],
];

const FEATURES = [
  ["Shareable views", "The question, retriever, setting, k and overlays live in the URL, so any view can be copied and reopened exactly."],
  ["Guided tour", "Four preset cases that each land you in a real, explained state rather than an empty screen."],
  ["Bring your own data", "Paste a passage and mark spans by hand, or upload a full JSON bundle and watch every panel re-render on it."],
  ["Live retrieval", "Type a Luxembourgish query and run the character-BM25 retriever over the corpus. No API key, no account, no per-query cost."],
  ["Glossary and glosses", "Every technical label carries an English gloss on hover, and the glossary defines each term with examples."],
  ["No inference at serve time", "Model answers are precomputed and read from released files, so nothing you do here calls an LLM."],
];

export default function Home({ data, onEnter, onTour, onUseYourData, onGlossary }) {
  const texts = data?.texts?.length ?? 0;
  const questions = data?.questions?.length ?? 0;
  const answers = data?.answers?.length ?? 0;
  const categories = Object.keys(data?.meta?.categories ?? {}).length;
  const models = Object.keys(data?.meta?.models ?? {}).length;
  const retrievers = Object.keys(data?.meta?.retrievers ?? {}).length;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-4xl px-6 pb-20">
        <header className="pt-16 pb-10">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
            Interactive diagnosis for Luxembourgish reading comprehension
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
            LuxDiag Workbench
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-stone-600">
            Two completed studies over the same 16 Luxembourgish texts, placed on one
            shared coordinate system so you can inspect them together, one example at a
            time. Which passage was retrieved, whether it helped or misled, how each model
            answered, and which tokens an annotation system got right.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onEnter}
              className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              Open the workbench →
            </button>
            <button
              type="button"
              onClick={onTour}
              className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
            >
              ▸ Take the guided tour
            </button>
            <span className="text-xs text-stone-400">No account. Nothing to install.</span>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat value={texts} label="texts" />
          <Stat value={questions} label="questions" />
          <Stat value={answers.toLocaleString("en-US")} label="answers" />
          <Stat value={retrievers} label="retrievers" />
          <Stat value={models} label="models" />
          <Stat value={categories} label="categories" />
        </div>

        <Section eyebrow="What it is" title="A diagnostic lens on studies that are already finished">
          <div className="space-y-3 text-[15px] leading-relaxed text-stone-700">
            <p>
              Papers report aggregate scores. The examples that explain those scores
              usually stay in the authors' notebooks. This workbench puts them back in
              reach: a reading-comprehension study with evidence spans, and a token
              annotation study comparing encoders against LLMs, both indexed into the same
              character offsets over the same texts.
            </p>
            <p>
              Because every layer speaks one coordinate system, a retrieved chunk, an
              evidence span and an annotated token can be laid over each other exactly.
              That is what lets you ask a question neither study answers alone, and get
              to the specific example behind the answer.
            </p>
          </div>
        </Section>

        <Section eyebrow="What it is not" title="Four things to be clear about">
          <ul className="space-y-2.5">
            {[
              ["Not a benchmark or a leaderboard.", "It is a lens on two specific studies over a small corpus. Findings hold for this resource, not as general laws."],
              ["It does not run RAG live.", "Every answer is precomputed and read from released files. The only live computation is the character-BM25 retriever in the query playground."],
              ["Not a general-purpose annotation tool.", "It renders annotations that already exist. Use brat or Prodigy to create them."],
              ["Not a model.", "Nothing here is trained, and no LLM is called while you use it."],
            ].map(([bold, rest]) => (
              <li key={bold} className="flex gap-2.5 text-[15px] leading-relaxed text-stone-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />
                <span><span className="font-medium text-stone-900">{bold}</span> {rest}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section eyebrow="Who it is for" title="And what each person gets out of it">
          <div className="grid gap-3 sm:grid-cols-2">
            {AUDIENCES.map(([who, why]) => (
              <div key={who} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="text-sm font-semibold text-stone-900">{who}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{why}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="The interface" title="Four linked panels over one passage">
          <p className="mb-4 text-[15px] leading-relaxed text-stone-700">
            Pick a question on the left and the passage appears in the middle with its
            evidence and linguistic phenomena highlighted. The panels on the right are all
            views of that same selection, so switching tabs never loses your place.
            Clicking almost anything highlights the characters it refers to.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PANELS.map(([name, desc]) => (
              <div key={name} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="text-sm font-semibold text-accent">{name}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{desc}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Everything else" title="Features worth knowing about">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {FEATURES.map(([name, desc]) => (
              <div key={name}>
                <div className="text-sm font-semibold text-stone-900">{name}</div>
                <p className="mt-1 text-sm leading-relaxed text-stone-600">{desc}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="How it works" title="One canonical text, many layers">
          <div className="space-y-3 text-[15px] leading-relaxed text-stone-700">
            <p>
              Each document has a single canonical text. Every span any study produced is
              stored as a character range into it, so layers built on different
              tokenizations line up without anyone having to agree on a segmentation.
              Standoff offsets are not new; getting two independently built pipelines to
              share them is the work.
            </p>
            <p>
              The interface itself is a pure function of a small set of JSON files. No
              dataset-specific logic is hard-coded, which is why you can load a study of
              your own and get the same four panels.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onUseYourData}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
            >
              ✎ Use your own data
            </button>
            <button
              type="button"
              onClick={onGlossary}
              className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
            >
              📖 Open the glossary
            </button>
          </div>
        </Section>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stone-200 bg-white px-6 py-5">
          <div>
            <div className="text-sm font-semibold text-stone-900">Ready to look at an example?</div>
            <p className="mt-0.5 text-sm text-stone-500">
              The guided tour is the fastest way in if you have not read the paper.
            </p>
          </div>
          <button
            type="button"
            onClick={onEnter}
            className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            Open the workbench →
          </button>
        </div>

        <footer className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-400">
          <span>Interface under MIT.</span>
          <span>LuxDiagRC under CC BY 4.0.</span>
          <a className="underline hover:text-stone-600" href="https://github.com/RedPill47/luxdiag-workbench">Source</a>
          <span>No user data is stored and no account is required.</span>
        </footer>
      </div>
    </div>
  );
}
