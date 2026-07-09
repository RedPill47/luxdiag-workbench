// Live retrieval serverless function (brief §5). Character-n-gram BM25 over
// the precomputed chunk corpus — no API keys, no LLM calls, no answering.
// Char n-grams are the headline finding for this morphologically rich,
// low-resource language, so lexical char-BM25 is the live mode.

import CORPUS from "./_corpus.js";

const K1 = 1.5;
const B = 0.75;
const NGRAM_MIN = 3;
const NGRAM_MAX = 5;

// Lowercase, split into word tokens (Unicode letters/numbers, keeps ë é ä …).
function words(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

// Character n-grams (3–5) within each word — captures subword morphology.
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

// Build the BM25 index once at cold start.
function buildIndex(corpus) {
  const docs = corpus.map((c) => {
    const tf = new Map();
    const grams = charNgrams(c.chunk_text);
    for (const g of grams) tf.set(g, (tf.get(g) || 0) + 1);
    return { ...c, tf, len: grams.length };
  });
  const N = docs.length;
  const df = new Map();
  for (const d of docs) for (const g of d.tf.keys()) df.set(g, (df.get(g) || 0) + 1);
  const idf = new Map();
  for (const [g, n] of df) idf.set(g, Math.log((N - n + 0.5) / (n + 0.5) + 1));
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / (N || 1);
  return { docs, idf, avgdl };
}

const INDEX = buildIndex(CORPUS);

function score(queryGrams, doc, idf, avgdl) {
  let s = 0;
  const seen = new Set();
  for (const g of queryGrams) {
    if (seen.has(g)) continue;
    seen.add(g);
    const f = doc.tf.get(g);
    if (!f) continue;
    const w = idf.get(g) || 0;
    s += w * (f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / avgdl));
  }
  return s;
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const { query, setting = "open_corpus", text_id, k = 5 } = req.body || {};
  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(400).json({ error: "query required" });
    return;
  }
  const qGrams = charNgrams(query);
  const pool =
    setting === "text_restricted" && text_id
      ? INDEX.docs.filter((d) => d.text_id === text_id)
      : INDEX.docs;

  const ranked = pool
    .map((d) => ({ chunk_id: d.chunk_id, text_id: d.text_id, score: score(qGrams, d, INDEX.idf, INDEX.avgdl) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(10, k)))
    .map((r, i) => ({ ...r, rank: i + 1, score: Math.round(r.score * 10000) / 10000 }));

  res.status(200).json({ method: "bm25_char", setting, ranked_chunks: ranked });
}
