// Times the app's real upfront load path on the scaled bundles written by
// scalability_bench.py: JSON.parse, the join-index build that dataLoader.js
// performs, and one buildPassageOverlays call (the per-selection work the
// passage view does). Retrieval is excluded because the app lazy-loads it.
//
//   node export/scalability_bench.mjs /tmp/luxdiag-scale
import { readFileSync } from "node:fs";
import { buildPassageOverlays } from "../src/lib/overlays.js";

const DIR = process.argv[2] ?? "/tmp/luxdiag-scale";
const SCALES = [1, 4, 16, 32];
const FILES = ["texts", "questions", "chunks", "answers", "annotations", "aggregates", "meta"];
const REPS = 5;
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

const indexBy = (arr, key) => { const m = new Map(); for (const i of arr) m.set(i[key], i); return m; };
const groupBy = (arr, key) => {
  const m = new Map();
  for (const i of arr) { const k = i[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
  return m;
};

function buildIndices({ texts, questions, chunks, answers, annotations }) {
  return {
    textsById: indexBy(texts, "text_id"),
    questionsById: indexBy(questions, "question_id"),
    questionsByText: groupBy(questions, "text_id"),
    chunksById: indexBy(chunks, "chunk_id"),
    chunksByText: groupBy(chunks, "text_id"),
    annotationsByText: groupBy(annotations, "text_id"),
    answersByQMS: groupBy(
      answers.map((a) => ({ ...a, _key: `${a.question_id}|${a.model}|${a.setting}` })), "_key"),
  };
}

console.log(
  "scale".padStart(6), "parse ms".padStart(9), "index ms".padStart(9),
  "load ms".padStart(8), "overlay ms".padStart(11), "heap MB".padStart(8));
for (const n of SCALES) {
  const blobs = Object.fromEntries(FILES.map((f) => [f, readFileSync(`${DIR}/x${n}/${f}.json`, "utf8")]));
  let parseT = [], indexT = [], ovT = [], heap = 0;
  for (let r = 0; r < REPS; r++) {
    let t0 = performance.now();
    const raw = Object.fromEntries(Object.entries(blobs).map(([k, v]) => [k, JSON.parse(v)]));
    parseT.push(performance.now() - t0);

    t0 = performance.now();
    const idx = buildIndices(raw);
    indexT.push(performance.now() - t0);

    const q = raw.questions[Math.floor(raw.questions.length / 2)];
    const rows = idx.annotationsByText.get(q.text_id) ?? [];
    t0 = performance.now();
    buildPassageOverlays({ question: q, annotationRows: rows, meta: raw.meta });
    ovT.push(performance.now() - t0);
    heap = Math.max(heap, process.memoryUsage().heapUsed / 1e6);
  }
  const p = median(parseT), i = median(indexT);
  console.log(
    `x${n}`.padStart(6), p.toFixed(0).padStart(9), i.toFixed(0).padStart(9),
    (p + i).toFixed(0).padStart(8), median(ovT).toFixed(2).padStart(11),
    heap.toFixed(0).padStart(8));
}
