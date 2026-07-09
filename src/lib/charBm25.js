// Client-side character-n-gram BM25 — the same method as the serverless
// /api/retrieve endpoint (K1=1.5, B=0.75, 3–5-grams), ported so the "try your
// own text" playground can retrieve over a passage the visitor pastes, with no
// server, no API key, and no cost. Keeping the params identical means the
// playground demonstrates the retriever from the paper, not an approximation.

const K1 = 1.5;
const B = 0.75;
const NGRAM_MIN = 3;
const NGRAM_MAX = 5;

function words(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function charNgrams(text) {
  const grams = [];
  for (const w of words(text)) {
    const s = `^${w}$`;
    for (let n = NGRAM_MIN; n <= NGRAM_MAX; n++) {
      for (let i = 0; i + n <= s.length; i++) grams.push(s.slice(i, i + n));
    }
  }
  return grams;
}

/**
 * Split text into overlapping chunks that preserve character offsets, so a
 * retrieved chunk can be highlighted back in the passage. Groups sentences into
 * windows (size `win`, step `win-1` for one-sentence overlap); falls back to the
 * whole text if there are no sentence boundaries.
 */
export function chunkText(text, win = 2) {
  const sentences = [];
  const re = /[^.!?\n]+[.!?]*\s*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].trim()) sentences.push({ start: m.index, end: m.index + m[0].length });
  }
  if (sentences.length === 0) {
    return text.trim() ? [{ id: "c0", start: 0, end: text.length, text }] : [];
  }
  const chunks = [];
  const step = Math.max(1, win - 1);
  for (let i = 0; i < sentences.length; i += step) {
    const group = sentences.slice(i, i + win);
    if (group.length === 0) break;
    const start = group[0].start;
    const end = group[group.length - 1].end;
    chunks.push({ id: `c${chunks.length}`, start, end, text: text.slice(start, end) });
    if (i + win >= sentences.length) break;
  }
  return chunks;
}

function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const tf = new Map();
    const grams = charNgrams(c.text);
    for (const g of grams) tf.set(g, (tf.get(g) || 0) + 1);
    return { ...c, tf, len: grams.length };
  });
  const N = docs.length || 1;
  const df = new Map();
  for (const d of docs) for (const g of d.tf.keys()) df.set(g, (df.get(g) || 0) + 1);
  const idf = new Map();
  for (const [g, n] of df) idf.set(g, Math.log((N - n + 0.5) / (n + 0.5) + 1));
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / N;
  return { docs, idf, avgdl };
}

function scoreDoc(qGrams, doc, idf, avgdl) {
  let s = 0;
  const seen = new Set();
  for (const g of qGrams) {
    if (seen.has(g)) continue;
    seen.add(g);
    const f = doc.tf.get(g);
    if (!f) continue;
    const w = idf.get(g) || 0;
    s += (w * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * doc.len) / avgdl));
  }
  return s;
}

/** Rank `chunks` against `query`; returns top-k [{id,start,end,text,score,rank}]. */
export function rankChunks(chunks, query, k = 5) {
  if (!chunks.length || !query.trim()) return [];
  const { docs, idf, avgdl } = buildIndex(chunks);
  const qGrams = charNgrams(query);
  return docs
    .map((d) => ({ id: d.id, start: d.start, end: d.end, text: d.text, score: scoreDoc(qGrams, d, idf, avgdl) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r, i) => ({ ...r, rank: i + 1, score: Math.round(r.score * 1000) / 1000 }));
}
