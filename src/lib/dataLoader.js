// Loads the dataset and builds the cross-reference indices every panel joins on.
// The app treats all of this as read-only. The schema is the contract: the same
// indices are built whether the data is fetched from public/data/ (the released
// LuxDiagRC dataset) or supplied by a reviewer as an uploaded bundle.

// retrieval is lazy-loaded per question for the fetched dataset (see
// retrievalClient.js). An uploaded bundle instead carries it in memory.
const FILES = [
  "texts",
  "questions",
  "chunks",
  "answers",
  "annotations",
  "aggregates",
  "meta",
];

async function fetchJson(name, base) {
  const res = await fetch(`${base}${name}.json`);
  if (!res.ok) throw new Error(`Failed to load ${name}.json (${res.status})`);
  return res.json();
}

function indexBy(arr, key) {
  const m = new Map();
  for (const item of arr) m.set(item[key], item);
  return m;
}

function groupBy(arr, key) {
  const m = new Map();
  for (const item of arr) {
    const k = item[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

// Build the retrieval-in-memory index from a bundle's `retrieval` object, keyed
// question_id -> Map("retriever|setting" -> ranked_chunks). Returns null if the
// dataset is fetched (retrieval stays lazy) or no retrieval was supplied.
function buildRetrievalMemory(retrieval) {
  if (!retrieval || typeof retrieval !== "object") return null;
  const byQ = new Map();
  for (const [qid, entries] of Object.entries(retrieval)) {
    const m = new Map();
    for (const e of entries ?? []) m.set(`${e.retriever}|${e.setting}`, e.ranked_chunks);
    byQ.set(qid, m);
  }
  return byQ;
}

// Assemble the data object (arrays + join indices) from raw sections. Shared by
// the fetched dataset and uploaded bundles so both take the identical code path.
function assemble(raw, { custom = false } = {}) {
  const texts = raw.texts ?? [];
  const questions = raw.questions ?? [];
  const chunks = raw.chunks ?? [];
  const answers = raw.answers ?? [];
  const annotations = raw.annotations ?? [];
  const aggregates = raw.aggregates ?? {};
  const meta = raw.meta ?? {};

  return {
    meta,
    guide: raw.guide ?? null,
    aggregates,
    custom,
    retrievalMemory: buildRetrievalMemory(raw.retrieval),
    texts,
    questions,
    chunks,
    answers,
    annotations,
    textsById: indexBy(texts, "text_id"),
    questionsById: indexBy(questions, "question_id"),
    questionsByText: groupBy(questions, "text_id"),
    chunksById: indexBy(chunks, "chunk_id"),
    chunksByText: groupBy(chunks, "text_id"),
    annotationsByText: groupBy(annotations, "text_id"),
    // answers grouped by (question, model, setting); RAG settings may hold
    // several entries (one per retriever×k), so the value is a list.
    answersByQMS: groupBy(
      answers.map((a) => ({ ...a, _key: `${a.question_id}|${a.model}|${a.setting}` })),
      "_key"
    ),
  };
}

/**
 * Load the released dataset from `base` and return arrays + join indices.
 * `base` defaults to the relative data dir so the same build works from a
 * sub-path (Vercel / GitHub Pages). Retrieval stays lazy (retrievalMemory=null).
 */
export async function loadData(base = "./data/") {
  const [texts, questions, chunks, answers, annotations, aggregates, meta] =
    await Promise.all(FILES.map((n) => fetchJson(n, base)));
  const guide = await fetchJson("guide", base).catch(() => null);
  return assemble({ texts, questions, chunks, answers, annotations, aggregates, meta, guide });
}

/**
 * Validate an uploaded bundle against the minimum schema. Returns an array of
 * human-readable problems (empty = valid). We require the three sections the
 * interface cannot render without; the rest are optional and degrade gracefully.
 */
export function validateBundle(b) {
  const errs = [];
  if (!b || typeof b !== "object") return ["The file is not a JSON object."];
  const arrayField = (name) => {
    if (!Array.isArray(b[name])) errs.push(`"${name}" must be an array.`);
    else if (b[name].length === 0) errs.push(`"${name}" is empty.`);
  };
  arrayField("texts");
  arrayField("questions");
  if (!b.meta || typeof b.meta !== "object") errs.push(`"meta" must be an object.`);
  if (Array.isArray(b.texts) && b.texts.some((t) => t.text_id == null || t.clean_text == null))
    errs.push(`every text needs "text_id" and "clean_text".`);
  if (
    Array.isArray(b.questions) &&
    b.questions.some((q) => q.question_id == null || q.text_id == null || !Array.isArray(q.options))
  )
    errs.push(`every question needs "question_id", "text_id", and an "options" array.`);
  // Optional sections must be the right shape if present.
  for (const f of ["chunks", "answers", "annotations"])
    if (b[f] != null && !Array.isArray(b[f])) errs.push(`"${f}" must be an array if present.`);
  return errs;
}

/**
 * Build a data object from an uploaded bundle (already parsed JSON). Throws with
 * a readable message if the bundle fails validation.
 */
export function loadDataFromBundle(bundle) {
  const errs = validateBundle(bundle);
  if (errs.length) throw new Error(errs.join(" "));
  return assemble(bundle, { custom: true });
}
