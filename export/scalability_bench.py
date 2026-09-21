#!/usr/bin/env python3
"""Synthesise scaled copies of the released bundle for the scalability check.

The corpus is replicated N times with suffixed ids, which preserves the shape
the app actually loads (texts, questions, chunks, answers, annotations) while
scaling the row counts. Retrieval is excluded: the app lazy-loads it per
question, so it does not grow the upfront payload.

Writes <outdir>/x<N>/ for each scale. Timing is done by scalability_bench.mjs.
"""
import json, os, sys, gzip, shutil

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
DEST = sys.argv[1] if len(sys.argv) > 1 else "/tmp/luxdiag-scale"
SCALES = [1, 4, 16, 32]
L = lambda n: json.load(open(os.path.join(OUT, n), encoding="utf-8"))

base = {n: L(f"{n}.json") for n in
        ("texts", "questions", "chunks", "answers", "annotations")}
APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data")
meta = json.load(open(os.path.join(APP, "meta.json"), encoding="utf-8"))
aggregates = L("aggregates.json")

def retag(obj, suffix):
    if isinstance(obj, dict):
        return {k: (v + suffix if k in ("text_id", "question_id", "chunk_id")
                    and isinstance(v, str) else retag(v, suffix))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [retag(v, suffix) for v in obj]
    return obj

os.makedirs(DEST, exist_ok=True)
print(f"{'scale':>6s} {'texts':>7s} {'questions':>10s} {'answers':>9s} "
      f"{'raw MB':>8s} {'gzip MB':>8s}")
for n in SCALES:
    d = os.path.join(DEST, f"x{n}")
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    raw = gz = 0
    for name, rows in base.items():
        scaled = []
        for i in range(n):
            scaled.extend(rows if i == 0 else retag(rows, f"_r{i}"))
        blob = json.dumps(scaled, ensure_ascii=False).encode()
        open(os.path.join(d, f"{name}.json"), "wb").write(blob)
        raw += len(blob); gz += len(gzip.compress(blob, 6))
    for name, obj in (("meta", meta), ("aggregates", aggregates)):
        blob = json.dumps(obj, ensure_ascii=False).encode()
        open(os.path.join(d, f"{name}.json"), "wb").write(blob)
        raw += len(blob); gz += len(gzip.compress(blob, 6))
    print(f"{'x'+str(n):>6s} {len(base['texts'])*n:7d} {len(base['questions'])*n:10d} "
          f"{len(base['answers'])*n:9d} {raw/1e6:8.1f} {gz/1e6:8.1f}")
print(f"\nbundles written to {DEST}")
