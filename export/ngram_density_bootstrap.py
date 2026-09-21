#!/usr/bin/env python3
"""Does the character-n-gram retrieval advantage concentrate on evidence spans
dense in particular linguistic phenomena?

For each annotation category we compare the character-BM25 minus word-BM25
evidence-recall@1 gap between questions whose critical span is dense in that
category and questions where it is sparse, and bootstrap the difference of
those two gaps. Resampling is over questions, which preserves the pairing
between the two retrievers (both are evaluated on the same question).

Two contrasts are reported because the categories differ wildly in base rate:
  tercile  - bottom third vs top third by occurrences per 100 characters
  presence - no occurrence in the critical span vs at least one

Nine categories are tested, so a Holm-adjusted bootstrap p-value is given
alongside the percentile interval.
"""
import json, os, random, statistics

random.seed(20260921)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
L = lambda n: json.load(open(os.path.join(OUT, n), encoding="utf-8"))
REPS = 2000

questions = [q for q in L("questions.json") if q["critical_spans"]]
annotations = L("annotations.json")
gold = {}
for rec in annotations:
    gold.setdefault((rec["text_id"], rec["category"]), []).extend(
        (o["start"], o["end"]) for o in rec["gold_occurrences"])
ranked = {}
for r in L("retrieval.json"):
    if r["setting"] == "open_corpus":
        ranked.setdefault(r["retriever"], {})[r["question_id"]] = r["ranked_chunks"]

def hit(qid, retriever, k=1):
    return 1.0 if any(c["contains_critical"] for c in ranked[retriever][qid][:k]) else 0.0

def density(q, cat):
    span_len = sum(s["end"] - s["start"] for s in q["critical_spans"]) or 1
    n = sum(1 for s in q["critical_spans"]
            for (a, b) in gold.get((q["text_id"], cat), [])
            if a < s["end"] and s["start"] < b)
    return 100.0 * n / span_len

PAIR = {qid: hit(qid, "bm25_char") - hit(qid, "bm25_word") for qid in ranked["bm25_char"]}

def contrast(low, high):
    return statistics.mean(PAIR[q] for q in high) - statistics.mean(PAIR[q] for q in low)

def bootstrap(low, high):
    obs = contrast(low, high)
    draws = []
    for _ in range(REPS):
        lo = [random.choice(low) for _ in low]
        hi = [random.choice(high) for _ in high]
        draws.append(contrast(lo, hi))
    draws.sort()
    ci = (draws[int(.025 * REPS)], draws[int(.975 * REPS) - 1])
    # two-sided bootstrap p: how often the resampled contrast crosses zero
    side = sum(1 for d in draws if d <= 0) if obs > 0 else sum(1 for d in draws if d >= 0)
    return obs, ci, min(1.0, 2.0 * side / REPS)

cats = sorted({r["category"] for r in annotations})
for mode in ("tercile", "presence"):
    rows = []
    for cat in cats:
        vals = sorted((density(q, cat), q["question_id"]) for q in questions)
        if vals[-1][0] == 0:
            continue
        if mode == "tercile":
            third = len(vals) // 3
            low = [v[1] for v in vals[:third]]; high = [v[1] for v in vals[-third:]]
        else:
            low = [v[1] for v in vals if v[0] == 0]; high = [v[1] for v in vals if v[0] > 0]
        if min(len(low), len(high)) < 20:
            rows.append((cat, None, None, None, len(low), len(high))); continue
        obs, ci, p = bootstrap(low, high)
        rows.append((cat, obs, ci, p, len(low), len(high)))

    tested = [r for r in rows if r[1] is not None]
    order = sorted(range(len(tested)), key=lambda i: tested[i][3])
    holm = {}
    m = len(tested)
    running = 0.0
    for rank, i in enumerate(order):
        adj = min(1.0, (m - rank) * tested[i][3])
        running = max(running, adj)
        holm[tested[i][0]] = running

    print(f"\n=== {mode}: char-minus-word evidence recall@1, dense minus sparse ===")
    print(f"{'category':22s} {'n_lo':>5s} {'n_hi':>5s} {'contrast':>9s} {'95% CI':>18s} {'p':>6s} {'Holm':>6s}")
    for cat, obs, ci, p, nlo, nhi in sorted(rows, key=lambda r: -(r[1] or -9)):
        if obs is None:
            print(f"{cat:22s} {nlo:5d} {nhi:5d}   (a group is too small to bootstrap)")
            continue
        star = "  *" if holm[cat] < .05 else ""
        print(f"{cat:22s} {nlo:5d} {nhi:5d} {obs:+9.3f} [{ci[0]:+.3f}, {ci[1]:+.3f}] {p:6.3f} {holm[cat]:6.3f}{star}")

overall = statistics.mean(PAIR.values())
draws = sorted(statistics.mean(random.choice(list(PAIR.values())) for _ in PAIR) for _ in range(REPS))
print(f"\noverall char-minus-word recall@1: {overall:+.3f} "
      f"[{draws[int(.025*REPS)]:+.3f}, {draws[int(.975*REPS)-1]:+.3f}]  (n={len(PAIR)})")
