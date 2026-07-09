# LuxDiag Workbench

An interactive, browser-based diagnostic workbench that makes completed
retrieval-augmented QA and token-annotation studies explorable on a **shared
character-offset coordinate system**. Every layer of every study — retrieved
chunks, evidence spans, model answers, and annotated tokens — indexes the same
character offsets in the same text, so studies that were run separately can be
examined together, one example at a time.

**Live demo:** https://luxdiag-workbench.vercel.app

The reference instantiation overlays two Luxembourgish studies over 16
native-authored texts: a 640-question evidence-grounded reading-comprehension
study and an encoder-versus-LLM token-annotation study. But the interface is a
**data-driven shell**, not a viewer for one corpus — see [Use your own
data](#use-your-own-data).

## What it does

Four linked panels are pure functions of a single global selection (question,
retriever, setting, `k`, overlays):

- **Retrieval** — the ranked chunks returned for the selected question, each
  flagged as containing critical or distractor evidence, with source/evidence
  recall@`k` and a corpus recall curve.
- **Answering** — how each model answers under closed-book, full-text-oracle, and
  RAG settings, badged by retrieval-trap class.
- **Retrieval-trap explorer** — answer accuracy aggregated by *what the retriever
  surfaced*, with drill-down to individual questions.
- **Annotation** — the category × system matrix contrasting fine-tuned encoders
  with LLM taggers; click a cell to highlight matched / missed / spurious tokens
  in the passage.

Plus a shared **passage view** with clickable, cross-linked span overlays; a
keyless **live retriever** (character-BM25, no LLM calls, no API keys); shareable,
reproducible **URL state**; and an onboarding tour and glossary.

## Use your own data

The app is a pure function of a small set of JSON files in `public/data/`.
Nothing in the interface is specific to a language, a model set, or a label
inventory, so any study expressed in the schema re-renders. Two ways to try it:

- **Paste a passage** into the playground and drive the character-BM25 retriever
  over it.
- **Upload a JSON bundle** (`Use your own data → Upload .json`) and every panel
  re-renders on your study, entirely in the browser.

A contrasting **English example bundle** ships in
`public/data/example-bundle.json` (different language, retrievers, LLMs, and a
named-entity/discourse label set). Load it from **Use your own data → Load English
example** to see the same interface on data that shares nothing with the reference
corpus but its structure.

### Data schema (`public/data/`)

| File | Contents |
| --- | --- |
| `texts.json` | Source passages; each `clean_text` defines the shared coordinate system. |
| `questions.json` | MCQs with gold answers and critical/distractor character spans. |
| `chunks.json` | Offset-preserving passages the retrievers rank. |
| `retrieval/<qid>.json` | Per-question ranked chunks per retriever × scope. |
| `answers.json` | One record per question × model × setting, with the retrieval-trap class. |
| `annotations.json` | Per `(text, category)` gold occurrences and each system's surface predictions. |
| `aggregates.json` | Corpus-level curves, trap classes, and per-category / aggregate F1. |
| `meta.json` | Vocabularies: retrievers, models, settings, annotators, categories, regimes. |
| `guide.json` | Optional onboarding, glossary, English glosses, and guided-tour cases. |

An uploaded bundle carries the same sections as one JSON object (with `retrieval`
keyed by `question_id`); see `src/lib/dataLoader.js` (`validateBundle`) for the
minimum required fields.

## Run locally

```bash
git clone https://github.com/RedPill47/luxdiag-workbench.git
cd luxdiag-workbench
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # production build to dist/
npm run preview    # serve the production build locally
```

The app runs entirely client-side except for one optional serverless function,
`api/retrieve.js`, which powers keyless live retrieval on the deployed build.

## Project structure

```
api/            Serverless character-BM25 live-retrieval endpoint
public/data/    The dataset the app renders (see schema above)
src/
  components/   The four panels, passage view, playground, onboarding, glossary
  lib/          dataLoader, offsets/overlays, char-BM25, labels, palette
  pages/App.jsx Layout and global selection state
```

## Tech stack

Vite 8, React 19, Tailwind CSS v4, and Recharts. Deployed on Vercel (static SPA
plus one serverless function).

## Data and studies

The reference dataset is **LuxDiagRC**, a diagnostic reading-comprehension corpus
for Luxembourgish with linguistic and cognitive annotation layers (Gonçalves,
Lamsiyah, and Schommer, LoReSLM 2026). The LuxDiagRC data is released separately
under CC BY 4.0.

## License

Code is released under the MIT License — see [LICENSE](LICENSE).
