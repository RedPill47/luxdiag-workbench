// Lazy per-question retrieval loading (keeps the initial payload small), plus
// the optional live-retrieval call to the serverless function.

const cache = new Map(); // question_id -> Promise<Map<"retriever|setting", ranked_chunks>>

export function loadQuestionRetrieval(questionId, base = "./data/retrieval/") {
  if (!questionId) return Promise.resolve(new Map());
  if (!cache.has(questionId)) {
    const p = fetch(`${base}${questionId}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        const m = new Map();
        for (const e of arr) m.set(`${e.retriever}|${e.setting}`, e.ranked_chunks);
        return m;
      })
      .catch(() => new Map());
    cache.set(questionId, p);
  }
  return cache.get(questionId);
}

/**
 * Live retrieval for a user-supplied query. Calls the serverless function;
 * returns { ranked_chunks: [{chunk_id, score, rank}], method } or throws.
 * Only used when meta.flags.live_retrieval_enabled is true.
 */
export async function liveRetrieve({ query, setting = "open_corpus", text_id, k = 5 }) {
  const res = await fetch("/api/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, setting, text_id, k }),
  });
  if (!res.ok) throw new Error(`retrieve ${res.status}`);
  return res.json();
}
