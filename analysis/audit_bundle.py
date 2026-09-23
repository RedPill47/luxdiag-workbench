#!/usr/bin/env python3
"""Audit a released LuxDiag bundle and reproduce the paper's reported numbers.

    python3 analysis/audit_bundle.py [public/data] [-o audit/]

Reads a bundle directory (the layout served by the app: per-question retrieval
files under retrieval/) and writes four things:

  input_hashes.json     sha256 of every input file, so a result can be tied to
                        the exact bundle it came from
  reconciliation.json   how much of the annotation study's gold landed on the
                        canonical character offsets, and what did not
  retrieval_groups.json retrieval-trap groups recomputed from the source rule,
                        with accuracy in every answering setting
  category_contrast.json accuracy conditioned on evidence/category overlap,
                        pooled and stratified by model and by setting

Nothing here reads the paper: every number is derived from the bundle, so a
disagreement between this output and the paper is a real disagreement.
"""
import json, hashlib, argparse, collections, os, sys

def load(base, name):
    with open(os.path.join(base, name), encoding="utf-8") as f:
        return json.load(f)

def load_retrieval(base):
    """Retrieval ships either as one file or as per-question files."""
    mono = os.path.join(base, "retrieval.json")
    if os.path.exists(mono):
        out = collections.defaultdict(list)
        for e in load(base, "retrieval.json"):
            out[e["question_id"]].append(e)
        return dict(out)
    d = os.path.join(base, "retrieval")
    out = {}
    for fn in sorted(os.listdir(d)):
        if fn.endswith(".json"):
            out[fn[:-5]] = json.load(open(os.path.join(d, fn), encoding="utf-8"))
    return out

def hashes(base):
    out = {}
    for root, _, files in os.walk(base):
        for fn in sorted(files):
            if not fn.endswith(".json"):
                continue
            p = os.path.join(root, fn)
            h = hashlib.sha256(open(p, "rb").read()).hexdigest()
            out[os.path.relpath(p, base)] = h
    return out

def reconciliation(annotations, texts):
    per_cat, unlocated, across_break, roundtrip, naive = {}, [], 0, 0, 0
    for rec in annotations:
        src = collections.Counter(rec["predictions"]["gold"])
        located = collections.Counter(o["surface"].replace("\n", "") for o in rec["gold_occurrences"])
        exact = collections.Counter(o["surface"] for o in rec["gold_occurrences"])
        c = per_cat.setdefault(rec["category"], {"gold": 0, "located": 0})
        c["gold"] += sum(src.values())
        c["located"] += sum((src & located).values())
        naive += sum((src & exact).values())
        unlocated += [(rec["text_id"], rec["category"], s) for s in (src - located).elements()]
        for o in rec["gold_occurrences"]:
            if texts[rec["text_id"]][o["start"]:o["end"]] != o["surface"]:
                roundtrip += 1
            across_break += "\n" in o["surface"]
    gold = sum(c["gold"] for c in per_cat.values())
    loc = sum(c["located"] for c in per_cat.values())
    return {"gold_occurrences": gold, "located": loc,
            "rate_pct": round(100 * loc / gold, 2),
            "naive_contiguous_rate_pct": round(100 * naive / gold, 1),
            "recovered_across_line_break": across_break,
            "unlocated": unlocated, "roundtrip_failures": roundtrip,
            "per_category": per_cat}

def trap_groups(questions, chunks, retrieval, answers, retriever="hybrid_w_char", k=5):
    """Same rule as the source study: a span counts as retrieved when a top-k
    chunk from the question's own text overlaps it."""
    qs = {q["question_id"]: q for q in questions}
    ch = {c["chunk_id"]: c for c in chunks}
    skip = {q for q, v in qs.items() if not v["critical_spans"] or not v["distractor_spans"]}

    def hit(qid, span, setting):
        entry = next((e for e in retrieval.get(qid, [])
                      if e["retriever"] == retriever and e["setting"] == setting), None)
        if entry is None or span is None:
            return False
        q = qs[qid]
        for c in entry["ranked_chunks"][:k]:
            cc = ch[c["chunk_id"]]
            if cc["text_id"] == q["text_id"] and cc["start"] < span["end"] and cc["end"] > span["start"]:
                return True
        return False

    cls = {}
    for qid, q in qs.items():
        if qid in skip:
            continue
        crit = hit(qid, q["critical_spans"][0], "open_corpus")
        dist = hit(qid, q["distractor_spans"][0], "open_corpus")
        cls[qid] = ("both" if crit and dist else "distractor_only" if dist
                    else "critical_only" if crit else "neither")

    by_setting = collections.defaultdict(lambda: collections.defaultdict(list))
    for a in answers:
        g = cls.get(a["question_id"])
        if g:
            by_setting[a["setting"]][g].append(a["correct"])
    out = {"retriever": retriever, "k": k, "skipped_unresolved_span": len(skip), "groups": {}}
    for g in ("critical_only", "both", "distractor_only", "neither"):
        row = {"n_questions": sum(1 for v in cls.values() if v == g)}
        for st, groups in by_setting.items():
            vals = groups.get(g, [])
            if vals:
                row[st] = {"n": len(vals), "accuracy": round(sum(vals) / len(vals), 3)}
        out["groups"][g] = row
    return out

def category_contrast(questions, annotations, answers):
    gold = collections.defaultdict(list)
    for r in annotations:
        for o in r["gold_occurrences"]:
            gold[(r["text_id"], r["category"])].append((o["start"], o["end"]))
    qs = [q for q in questions if q["critical_spans"]]
    overlaps = lambda q, cat: any(a < s["end"] and s["start"] < b
                                  for s in q["critical_spans"]
                                  for (a, b) in gold[(q["text_id"], cat)])
    idx = collections.defaultdict(list)
    for a in answers:
        idx[a["question_id"]].append(a)

    def acc(qids, keep):
        vals = [a["correct"] for q in qids for a in idx[q] if keep(a)]
        return round(sum(vals) / len(vals), 3) if vals else None

    settings = sorted({a["setting"] for a in answers})
    models = sorted({a["model"] for a in answers})
    out = {"n_questions": len(qs), "categories": {}}
    for cat in sorted({r["category"] for r in annotations}):
        yes = [q["question_id"] for q in qs if overlaps(q, cat)]
        s = set(yes)
        no = [q["question_id"] for q in qs if q["question_id"] not in s]
        row = {"n_with": len(yes), "n_without": len(no)}
        if yes and no:
            for st in settings:
                f = lambda a, st=st: a["setting"] == st
                a1, a0 = acc(yes, f), acc(no, f)
                row[st] = {"with": a1, "without": a0, "delta": round(a1 - a0, 3)}
            row["by_model_open_corpus"] = {}
            for m in models:
                f = lambda a, m=m: a["setting"] == "rag_open_corpus" and a["model"] == m
                a1, a0 = acc(yes, f), acc(no, f)
                if a1 is not None and a0 is not None:
                    row["by_model_open_corpus"][m] = {"with": a1, "without": a0,
                                                      "delta": round(a1 - a0, 3)}
        out["categories"][cat] = row
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle", nargs="?", default="public/data")
    ap.add_argument("-o", "--out", default="audit")
    args = ap.parse_args()
    b = args.bundle
    if not os.path.isdir(b):
        sys.exit(f"no such bundle directory: {b}")
    os.makedirs(args.out, exist_ok=True)

    texts = {t["text_id"]: t["clean_text"] for t in load(b, "texts.json")}
    questions, chunks = load(b, "questions.json"), load(b, "chunks.json")
    answers, annotations = load(b, "answers.json"), load(b, "annotations.json")
    retrieval = load_retrieval(b)

    results = {
        "input_hashes.json": hashes(b),
        "reconciliation.json": reconciliation(annotations, texts),
        "retrieval_groups.json": trap_groups(questions, chunks, retrieval, answers),
        "category_contrast.json": category_contrast(questions, annotations, answers),
    }
    for name, obj in results.items():
        with open(os.path.join(args.out, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=1, ensure_ascii=False)
        print("wrote", os.path.join(args.out, name))

    r, t = results["reconciliation.json"], results["retrieval_groups.json"]
    print(f"\nreconciliation : {r['located']}/{r['gold_occurrences']} = {r['rate_pct']}% "
          f"(naive {r['naive_contiguous_rate_pct']}%), round-trip failures {r['roundtrip_failures']}")
    print("retrieval-trap (open-corpus RAG):")
    for g, row in t["groups"].items():
        oc = row.get("rag_open_corpus")
        if oc:
            print(f"  {g:16s} n_q={row['n_questions']:4d}  n={oc['n']:5d}  acc={oc['accuracy']}")

if __name__ == "__main__":
    main()
