#!/usr/bin/env python3
"""Split the monolithic retrieval.json into slim per-question files so the app
lazy-loads only the selected question's retrieval instead of 9.3 MB upfront.

Reads export/out/retrieval.json, writes public/data/retrieval/<qid>.json (one
array of {retriever, setting, ranked_chunks} per question), and removes the
monolithic public/data/retrieval.json. Drops the unused `metrics` and `rank`
fields (rank is the array index; the app derives @k metrics client-side).
"""
import json, collections
from pathlib import Path

WB = Path(__file__).resolve().parent.parent
SRC = WB / "export/out/retrieval.json"
DST = WB / "public/data/retrieval"

def main():
    entries = json.loads(SRC.read_text(encoding="utf-8"))
    by_q = collections.defaultdict(list)
    for e in entries:
        by_q[e["question_id"]].append({
            "retriever": e["retriever"],
            "setting": e["setting"],
            "ranked_chunks": [
                {"chunk_id": c["chunk_id"], "score": c["score"],
                 "contains_critical": c["contains_critical"],
                 "contains_distractor": c["contains_distractor"]}
                for c in e["ranked_chunks"]
            ],
        })
    DST.mkdir(parents=True, exist_ok=True)
    for qid, arr in by_q.items():
        (DST / f"{qid}.json").write_text(json.dumps(arr, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    mono = WB / "public/data/retrieval.json"
    if mono.exists():
        mono.unlink()
    total = sum((DST / f).stat().st_size for f in map(lambda q: f"{q}.json", by_q))
    print(f"wrote {len(by_q)} per-question files to public/data/retrieval/ "
          f"({total/1024/1024:.1f} MB total, was 9.3 MB monolith)")

if __name__ == "__main__":
    main()
