#!/usr/bin/env python3
"""Export DiagLux-RAG outputs into the workbench §2 schema.

Reads the real project at DIAGLUX_ROOT and writes JSON to export/out/.
Nothing here touches public/data — the swap happens only after validation.

Produces: texts.json, questions.json, chunks.json, retrieval.json,
answers.json, aggregates_diaglux.json (retrieval-trap, evidence-recall
curves, control accuracy — the DiagLux slice of aggregates.json).

Canonical clean_text = DiagLux clean body (title+author removed, NFC,
whitespace preserved) — replicated from src/diaglux/data/texts.py. Retrieval
and answering numbers are recomputed from the run outputs (rankings + preds)
so every figure is reproducible; cross-check against outputs/analysis before
camera-ready.
"""
from __future__ import annotations
import json, os, unicodedata, glob, collections
from pathlib import Path

DIAGLUX_ROOT = Path(os.environ.get("DIAGLUX_ROOT", "~/DiagLux-RAG")).expanduser()
OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(parents=True, exist_ok=True)

TEXT_IDS = [f"text{i}" for i in range(1, 17)]
K_LIST = [1, 3, 5, 10]
PRIMARY_K = 5

COGNITIVE = {
    "Retrieve": "retrieve_direct_fact",
    "Interpret": "interpretive_comprehension",
    "Inferential": "inferential_reasoning",
    "Evaluative": "evaluative_reasoning",
}
MODEL_MAP = {
    "claude-opus-4-8": "claude_opus_4_8",
    "gpt-5.5": "gpt_5_5",
    "claude-sonnet-4-6": "claude_sonnet_4_6",
    "deepseek-v4-pro": "deepseek_v4_pro",
}
# app retriever enum -> method slug used in rankings filenames
RETRIEVER_SLUG = {
    "bm25_word": "bm25",
    "bm25_char": "bm25_char_ngram",
    "dense_mE5": "dense_intfloat_multilingual-e5-base",
    "dense_bge_m3": "dense_BAAI_bge-m3",
    "hybrid_rrf_char": "hybrid_rrf_char_ngram",
    "hybrid_w_char": "hybrid_w0.5_char_ngram",
}
PRIMARY_RETRIEVER = "hybrid_w_char"
SETTINGS = ["text_restricted", "open_corpus"]


def load_clean_text(text_id):
    raw = (DIAGLUX_ROOT / "dataset" / "Texts" / f"{text_id}.txt").read_text(encoding="utf-8")
    if "\r\n" in raw:
        raw = raw.replace("\r\n", "\n")
    title_line, rest = raw.split("\n", 1)
    author_line, body = rest.split("\n", 1)
    return (
        unicodedata.normalize("NFC", title_line.strip()),
        unicodedata.normalize("NFC", author_line.strip()),
        unicodedata.normalize("NFC", body),
    )


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def dump(name, obj, compact=False):
    kw = dict(separators=(",", ":")) if compact else dict(indent=1)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, **kw), encoding="utf-8")


def overlaps(a, b):
    """Do half-open ranges (a[0],a[1]) and (b[0],b[1]) overlap?"""
    return a is not None and b is not None and a[0] < b[1] and b[0] < a[1]


# ---------------------------------------------------------------- texts
def build_texts():
    bodies, out = {}, []
    for tid in TEXT_IDS:
        title, _author, body = load_clean_text(tid)
        bodies[tid] = body
        out.append({"text_id": tid, "title": title, "clean_text": body,
                    "token_count": len(body.split()), "word_count": len(body.split())})
    dump("texts.json", out)
    return bodies


# ------------------------------------------------------------ questions
def span_or_empty(span):
    if not span:
        return []
    s, e, status = span.get("start"), span.get("end"), span.get("status")
    if s is None or e is None or status in ("unresolved", "empty"):
        return []
    return [{"start": s, "end": e}]


def build_questions(bodies):
    out, bad, q_index = [], [], {}
    for q in read_jsonl(DIAGLUX_ROOT / "outputs/processed/questions.jsonl"):
        pres = q["presented"]
        crit = span_or_empty(q.get("critical_span"))
        dist = span_or_empty(q.get("distractor_span"))
        body = bodies[q["text_id"]]
        for kind, spans in (("critical", crit), ("distractor", dist)):
            for sp in spans:
                if not (0 <= sp["start"] <= sp["end"] <= len(body)):
                    bad.append((q["question_id"], kind, sp))
        q_index[q["question_id"]] = {
            "text_id": q["text_id"],
            "critical": (crit[0]["start"], crit[0]["end"]) if crit else None,
            "distractor": (dist[0]["start"], dist[0]["end"]) if dist else None,
        }
        out.append({
            "question_id": q["question_id"], "text_id": q["text_id"], "question": q["question"],
            "options": [pres["A"], pres["B"], pres["C"], pres["D"]],
            "gold_option_index": ord(q["gold_letter"]) - 65,
            "cognitive_type": COGNITIVE[q["cognitive_type"]],
            "linguistic_categories": [t.lower() for t in q.get("linguistic_tags", [])],
            "critical_spans": crit, "distractor_spans": dist,
        })
    dump("questions.json", out)
    return out, bad, q_index


# --------------------------------------------------------------- chunks
def build_chunks(bodies, strategy="overlap"):
    out, mismatch, chunk_off = [], [], {}
    for c in read_jsonl(DIAGLUX_ROOT / f"outputs/processed/corpus_chunks_{strategy}.jsonl"):
        tid, s, e = c["text_id"], c["start_char"], c["end_char"]
        if bodies[tid][s:e] != c["chunk_text"]:
            mismatch.append(c["chunk_id"])
        chunk_off[c["chunk_id"]] = (tid, s, e)
        out.append({"chunk_id": c["chunk_id"], "text_id": tid, "start": s, "end": e,
                    "token_count": c.get("n_tokens"), "chunk_text": c["chunk_text"]})
    dump("chunks.json", out)
    return out, mismatch, chunk_off


# ------------------------------------------------------------ retrieval
def build_retrieval(q_index, chunk_off):
    """Write retrieval.json; return index {(retriever,setting,qid): ranked_chunks}."""
    entries, index, missing = [], {}, []
    for retriever, slug in RETRIEVER_SLUG.items():
        for setting in SETTINGS:
            fn = DIAGLUX_ROOT / f"outputs/retrieval/rankings_{setting}_{slug}_overlap_question_options.jsonl"
            if not fn.exists():
                missing.append(fn.name)
                continue
            for rec in read_jsonl(fn):
                qid = rec["question_id"]
                qi = q_index.get(qid)
                if qi is None:
                    continue
                crit, dist = qi["critical"], qi["distractor"]
                ranked = []
                for r in sorted(rec["ranking"], key=lambda x: x["rank"])[:10]:
                    off = chunk_off.get(r["chunk_id"])
                    # A chunk can only carry this question's evidence if it comes
                    # from the question's own text. Without this check, a chunk of
                    # another text whose character offsets happen to overlap the
                    # span counts as a hit and inflates evidence recall (and the
                    # retrieval-trap groups derived from it).
                    same_text = off is not None and off[0] == qi["text_id"]
                    crange = (off[1], off[2]) if same_text else None
                    ranked.append({
                        "chunk_id": r["chunk_id"], "rank": r["rank"], "score": round(r["score"], 4),
                        "contains_critical": overlaps(crange, crit),
                        "contains_distractor": overlaps(crange, dist),
                    })
                index[(retriever, setting, qid)] = ranked
                same_text = [c for c in ranked if chunk_off.get(c["chunk_id"], (None,))[0] == qi["text_id"]]
                entries.append({
                    "question_id": qid, "retriever": retriever, "setting": setting,
                    "ranked_chunks": ranked,
                    "metrics": {
                        "source_recall_at_10": 1.0 if same_text else (1.0 if any(chunk_off.get(c["chunk_id"],(None,))[0]==qi["text_id"] for c in ranked) else 0.0),
                        "evidence_recall_at_1": 1.0 if (ranked and ranked[0]["contains_critical"]) else 0.0,
                        "evidence_recall_at_10": 1.0 if any(c["contains_critical"] for c in ranked) else 0.0,
                    },
                })
    dump("retrieval.json", entries, compact=True)
    return index, missing


# --------------------------------------------------------------- preds
def load_preds():
    preds = []
    for fn in glob.glob(str(DIAGLUX_ROOT / "outputs/runs/preds_*.jsonl")):
        for rec in read_jsonl(fn):
            preds.append(rec)
    return preds


def trap_class(any_crit, any_dist):
    if any_crit and any_dist:
        return "both"
    if any_crit:
        return "critical_only"
    if any_dist:
        return "distractor_only"
    return "neither"


def trap_by_qs(retr_index, q_index, retriever=PRIMARY_RETRIEVER, k=PRIMARY_K):
    """(qid,setting) -> trap class at top-k, only when BOTH spans resolved."""
    out = {}
    for (r, setting, qid), ranked in retr_index.items():
        if r != retriever:
            continue
        qi = q_index[qid]
        if qi["critical"] is None or qi["distractor"] is None:
            continue  # match the project's unresolved-span skip
        top = ranked[:k]
        out[(qid, setting)] = trap_class(
            any(c["contains_critical"] for c in top),
            any(c["contains_distractor"] for c in top),
        )
    return out


# -------------------------------------------------------------- answers
def build_answers(preds, trap_qs):
    out = []
    for p in preds:
        model = MODEL_MAP.get(p.get("model"))
        if model is None:
            continue
        system, setting, k = p.get("system"), p.get("setting"), p.get("k")
        rag = None
        if system == "closed_book":
            app_setting = "closed_book"
        elif system == "oracle":
            app_setting = "full_text_oracle"
        elif system == RETRIEVER_SLUG[PRIMARY_RETRIEVER] and setting in SETTINGS and k == PRIMARY_K:
            app_setting, rag = f"rag_{setting}", setting
        else:
            continue
        letter = p.get("parsed_letter")
        rec = {
            "question_id": p["question_id"], "model": model, "setting": app_setting,
            "predicted_option_index": (ord(letter) - 65) if (isinstance(letter, str) and letter in "ABCD") else None,
            "correct": bool(p.get("is_correct")),
        }
        if rag is not None:
            rec["retriever"] = PRIMARY_RETRIEVER
            rec["k"] = PRIMARY_K
            rec["retrieval_trap_class"] = trap_qs.get((p["question_id"], rag))
        out.append(rec)
    dump("answers.json", out, compact=True)
    return out


# ----------------------------------------------------------- aggregates
def build_aggregates(preds, retr_index, q_index, trap_qs):
    # evidence-recall curves: mean over questions with a resolved critical span
    curves = {s: {} for s in SETTINGS}
    for (r, setting, qid), ranked in retr_index.items():
        pass
    for retriever in RETRIEVER_SLUG:
        for setting in SETTINGS:
            qids = [qid for (rr, ss, qid) in retr_index if rr == retriever and ss == setting
                    and q_index[qid]["critical"] is not None]
            if not qids:
                continue
            row = {}
            for k in K_LIST:
                hits = sum(1 for qid in qids
                           if any(c["contains_critical"] for c in retr_index[(retriever, setting, qid)][:k]))
                row[str(k)] = round(hits / len(qids), 3)
            curves[setting][retriever] = row

    # retrieval-trap: primary retriever, open_corpus, k=5, over the 4 models' RAG answers
    by_class = collections.defaultdict(lambda: {"n": 0, "correct": 0, "distractor": 0})
    for p in preds:
        if p.get("model") not in MODEL_MAP:
            continue
        if p.get("system") != RETRIEVER_SLUG[PRIMARY_RETRIEVER] or p.get("setting") != "open_corpus" or p.get("k") != PRIMARY_K:
            continue
        cls = trap_qs.get((p["question_id"], "open_corpus"))
        if cls is None:
            continue
        b = by_class[cls]
        b["n"] += 1
        b["correct"] += 1 if p.get("is_correct") else 0
        b["distractor"] += 1 if p.get("semantic_choice") == "distractor_span" else 0
    trap = {
        "best_retriever": PRIMARY_RETRIEVER, "setting": "open_corpus", "k": PRIMARY_K,
        "by_class": {
            cls: {"n_questions": b["n"],
                  "accuracy": round(b["correct"] / b["n"], 3) if b["n"] else None,
                  "distractor_choice_rate": round(b["distractor"] / b["n"], 3) if b["n"] else None}
            for cls, b in by_class.items()
        },
    }

    # control accuracy: closed_book / oracle, per model
    control = {"closed_book": {}, "full_text_oracle": {}}
    acc = collections.defaultdict(lambda: [0, 0])
    for p in preds:
        model = MODEL_MAP.get(p.get("model"))
        if model is None:
            continue
        key = {"closed_book": "closed_book", "oracle": "full_text_oracle"}.get(p.get("system"))
        if key is None:
            continue
        a = acc[(key, model)]
        a[0] += 1 if p.get("is_correct") else 0
        a[1] += 1
    for (key, model), (c, n) in acc.items():
        control[key][model] = round(c / n, 3) if n else None

    agg = {"retrieval_trap": trap, "evidence_recall_curves": curves, "control_accuracy": control}
    dump("aggregates_diaglux.json", agg)
    return agg


def main():
    print(f"DiagLux root: {DIAGLUX_ROOT}")
    bodies = build_texts(); print(f"texts.json: {len(bodies)}")
    questions, bad_spans, q_index = build_questions(bodies)
    print(f"questions.json: {len(questions)} (bad spans: {len(bad_spans)})")
    chunks, chunk_mismatch, chunk_off = build_chunks(bodies)
    print(f"chunks.json: {len(chunks)} (mismatches: {len(chunk_mismatch)})")

    retr_index, missing = build_retrieval(q_index, chunk_off)
    n_entries = len(retr_index)
    print(f"retrieval.json: {n_entries} entries (missing ranking files: {missing or 'none'})")

    preds = load_preds(); print(f"loaded {len(preds)} pred records")
    tqs = trap_by_qs(retr_index, q_index)
    answers = build_answers(preds, tqs)
    print(f"answers.json: {len(answers)} entries")

    agg = build_aggregates(preds, retr_index, q_index, tqs)
    tb = agg["retrieval_trap"]["by_class"]
    print("retrieval_trap by_class:")
    for c in ("critical_only", "both", "distractor_only", "neither"):
        if c in tb:
            print(f"  {c:16s} n={tb[c]['n_questions']:5d} acc={tb[c]['accuracy']} dist_rate={tb[c]['distractor_choice_rate']}")
    print("control_accuracy:", json.dumps(agg["control_accuracy"]))

    ok = not bad_spans and not chunk_mismatch and not missing
    print("\nDIAGLUX EXPORT VALIDATION:", "PASS ✅" if ok else "FAIL ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
