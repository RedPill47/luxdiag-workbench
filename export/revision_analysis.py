#!/usr/bin/env python3
"""Numbers added in the EACL 2027 revision.

Recomputes, from the released bundle in ``out/``, the three analyses the EMNLP
reviewers asked for:

  1. offset reconciliation coverage of the annotation layer  (Sec. 3)
  2. retrieval-trap accuracy under every answering setting   (Sec. 5)
  3. answer accuracy conditioned on annotation category      (Sec. 5)

Writes ``out/aggregates_revision.json`` and prints the LaTeX tables.
Run:  python3 export/revision_analysis.py
"""
import json, collections, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
load = lambda n: json.load(open(os.path.join(OUT, n), encoding="utf-8"))

questions = load("questions.json")
answers = load("answers.json")
annotations = load("annotations.json")
texts = {t["text_id"]: t["clean_text"] for t in load("texts.json")}


def reconciliation():
    """How much of the annotation study landed on the canonical coordinate.

    Two rates are reported. ``naive`` is what a plain contiguous surface match
    recovers. ``rate`` is what the export's de-newlining projection recovers:
    the source pipeline stripped line breaks before tagging, so a token pair
    straddling one arrives glued, and is located by searching a newline-free
    projection of the canonical text and mapping the hit back to real offsets.
    The recovered span is contiguous in the canonical text and contains the
    newline.
    """
    per_cat, roundtrip_failures, unlocated, across_break = {}, 0, [], 0
    naive_total = 0
    for rec in annotations:
        source_bag = collections.Counter(rec["predictions"]["gold"])
        located_bag = collections.Counter(
            o["surface"].replace("\n", "") for o in rec["gold_occurrences"])
        exact_bag = collections.Counter(o["surface"] for o in rec["gold_occurrences"])
        cat = per_cat.setdefault(rec["category"], {"gold": 0, "located": 0})
        cat["gold"] += sum(source_bag.values())
        cat["located"] += sum((source_bag & located_bag).values())
        naive_total += sum((source_bag & exact_bag).values())
        for surface in (source_bag - located_bag).elements():
            unlocated.append((rec["text_id"], rec["category"], surface))
        for occ in rec["gold_occurrences"]:
            if texts[rec["text_id"]][occ["start"]:occ["end"]] != occ["surface"]:
                roundtrip_failures += 1
            if "\n" in occ["surface"]:
                across_break += 1
    gold = sum(c["gold"] for c in per_cat.values())
    located = sum(c["located"] for c in per_cat.values())
    for c in per_cat.values():
        c["rate"] = round(100 * c["located"] / c["gold"], 1) if c["gold"] else None
    return {
        "gold_occurrences": gold,
        "located": located,
        "rate": round(100 * located / gold, 2),
        "naive_contiguous_rate": round(100 * naive_total / gold, 1),
        "recovered_across_line_break": across_break,
        "unlocated": gold - located,
        "unlocated_detail": unlocated,
        "roundtrip_failures": roundtrip_failures,
        "per_category": per_cat,
    }


SKIP = {q["question_id"] for q in questions
        if not q["critical_spans"] or not q["distractor_spans"]}


def trap_classes(retriever="hybrid_w_char", setting="open_corpus", k=5):
    """Recompute the retrieval-trap class per question.

    Mirrors DiagLux-RAG ``analysis/diagnostics.retrieval_trap``: a span counts as
    retrieved when some top-k chunk from the same text overlaps it (half-open
    interval test), and questions with an unresolved critical or distractor span
    are skipped. Do NOT use the ``retrieval_trap_class`` field stored in
    answers.json: it was derived by a different rule at export time and does not
    reproduce the source study's groups.
    """
    chunks = {c["chunk_id"]: c for c in load("chunks.json")}
    ranked = {r["question_id"]: r for r in load("retrieval.json")
              if r["retriever"] == retriever and r["setting"] == setting}
    qs = {q["question_id"]: q for q in questions}

    def overlaps(chunk_id, q, span):
        c = chunks[chunk_id]
        return (c["text_id"] == q["text_id"]
                and c["start"] < span["end"] and c["end"] > span["start"])

    out = {}
    for qid, q in qs.items():
        if qid in SKIP:
            continue
        top = [c["chunk_id"] for c in ranked[qid]["ranked_chunks"][:k]]
        crit = any(overlaps(c, q, q["critical_spans"][0]) for c in top)
        dist = any(overlaps(c, q, q["distractor_spans"][0]) for c in top)
        out[qid] = ("both" if crit and dist else "distractor_only" if dist
                    else "critical_only" if crit else "neither")
    return out


def trap_by_setting():
    """Trap-group accuracy in all four settings: the oracle is the difficulty control."""
    cls = trap_classes()
    settings = ["rag_open_corpus", "full_text_oracle", "closed_book", "rag_text_restricted"]
    rows = {}
    for grp in ["both", "critical_only", "distractor_only", "neither"]:
        qids = {q for q, c in cls.items() if c == grp}
        row = {"n_questions": len(qids)}
        for st in settings:
            inst = [a for a in answers if a["setting"] == st and a["question_id"] in qids]
            row[st] = round(sum(a["correct"] for a in inst) / len(inst), 3)
            row["n_instances_" + st] = len(inst)
        row["retrieval_cost"] = round(row["rag_open_corpus"] - row["full_text_oracle"], 3)
        rows[grp] = row
    return rows


def accuracy_by_category():
    """Does an annotation category on the evidence span predict answer accuracy?"""
    gold = collections.defaultdict(list)
    for rec in annotations:
        for o in rec["gold_occurrences"]:
            gold[(rec["text_id"], rec["category"])].append((o["start"], o["end"]))
    by_q = collections.defaultdict(list)
    for a in answers:
        by_q[(a["setting"], a["question_id"])].append(a)

    def overlaps(q, cat):
        return any(s < span["end"] and span["start"] < e
                   for span in q["critical_spans"]
                   for (s, e) in gold[(q["text_id"], cat)])

    def acc(setting, qids):
        inst = [a for q in qids for a in by_q[(setting, q)]]
        return round(sum(a["correct"] for a in inst) / len(inst), 3) if inst else None

    out = {}
    for cat in sorted({r["category"] for r in annotations}):
        inside = [q["question_id"] for q in questions if overlaps(q, cat)]
        outside = [q["question_id"] for q in questions if q["question_id"] not in set(inside)]
        if len(inside) < 5 or len(outside) < 5:
            out[cat] = {"n_questions_with": len(inside), "note": "insufficient contrast group"}
            continue
        oc_in, oc_out = acc("rag_open_corpus", inside), acc("rag_open_corpus", outside)
        or_in, or_out = acc("full_text_oracle", inside), acc("full_text_oracle", outside)
        out[cat] = {
            "n_questions_with": len(inside), "n_questions_without": len(outside),
            "open_corpus_with": oc_in, "open_corpus_without": oc_out,
            "open_corpus_delta": round(oc_in - oc_out, 3),
            "oracle_with": or_in, "oracle_without": or_out,
            "oracle_delta": round(or_in - or_out, 3),
        }
    return out


def latex_reconciliation(r):
    order = sorted((c for c in r["per_category"] if r["per_category"][c]["gold"]),
                   key=lambda c: -r["per_category"][c]["gold"])
    lines = ["% generated by export/revision_analysis.py",
             "\\begin{tabular}{lrrr}", "\\toprule",
             "Category & Gold occ. & Located & \\% \\\\", "\\midrule"]
    for c in order:
        d = r["per_category"][c]
        lines.append(f"\\texttt{{{c}}} & {d['gold']} & {d['located']} & {d['rate']} \\\\")
    lines += ["\\midrule",
              f"\\textbf{{Total}} & \\textbf{{{r['gold_occurrences']}}} & "
              f"\\textbf{{{r['located']}}} & \\textbf{{{r['rate']}}} \\\\",
              "\\bottomrule", "\\end{tabular}"]
    return "\n".join(lines)


def latex_trap(t):
    label = {"both": "critical + distractor", "critical_only": "critical only",
             "distractor_only": "distractor only", "neither": "neither"}
    lines = ["% generated by export/revision_analysis.py",
             "\\begin{tabular}{lrrrrr}", "\\toprule",
             "\\makecell[l]{Evidence\\\\retrieved} & $n_q$ & \\makecell{Open-\\\\corpus} & "
             "\\makecell{Full-text\\\\oracle} & \\makecell{Closed-\\\\book} & "
             "\\makecell{Retrieval\\\\cost} \\\\", "\\midrule"]
    for cls in ["critical_only", "both", "distractor_only", "neither"]:
        d = t[cls]
        lines.append(f"{label[cls]} & {d['n_questions']} & {d['rag_open_corpus']:.3f} & "
                     f"{d['full_text_oracle']:.3f} & {d['closed_book']:.3f} & "
                     f"${d['retrieval_cost']:.3f}$ \\\\")
    lines += ["\\bottomrule", "\\end{tabular}"]
    return "\n".join(lines)


if __name__ == "__main__":
    report = {"reconciliation": reconciliation(),
              "trap_by_setting": trap_by_setting(),
              "accuracy_by_category": accuracy_by_category()}
    with open(os.path.join(OUT, "aggregates_revision.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    r = report["reconciliation"]
    print(f"reconciliation: {r['located']}/{r['gold_occurrences']} = {r['rate']}% "
          f"(naive contiguous match: {r['naive_contiguous_rate']}%)")
    print(f"  recovered across a line break: {r['recovered_across_line_break']}")
    print(f"  unlocated: {r['unlocated']} -> {r['unlocated_detail']}")
    print(f"  round-trip failures: {r['roundtrip_failures']}")
    print()
    deltas = [(c, d["open_corpus_delta"]) for c, d in report["accuracy_by_category"].items()
              if "open_corpus_delta" in d]
    print("largest |accuracy delta| by category:",
          max(abs(d) for _, d in deltas))
    paper = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "paper", "tables")
    if os.path.isdir(paper):
        for name, text in (("reconciliation.tex", latex_reconciliation(r)),
                           ("trap_by_setting.tex", latex_trap(report["trap_by_setting"]))):
            with open(os.path.join(paper, name), "w", encoding="utf-8") as f:
                f.write(text + "\n")
            print("wrote", os.path.join(paper, name))
