#!/usr/bin/env python3
"""Export Lux-ano-pip outputs into the workbench schema (approach i).

All Lux-ano-pip sources store newline-mangled surface bags, not offsets, so:
  * annotations.json carries, per (text, category): gold occurrences located
    on the canonical clean body via a de-newlining index (best-effort, for
    passage highlighting) + each annotator's surface bag (for the app's
    surface-multiset matched/missed/spurious counts).
  * per_category_f1 / aggregate_f1 come from the project's computed
    comparison.md (the official set-based metric — same numbers as the paper).

Writes to export/out/: annotations.json, aggregates_luxano.json, and the
merged aggregates.json (DiagLux + Lux). Canonical clean_text = DiagLux body.
"""
from __future__ import annotations
import json, os, re, glob, unicodedata
from pathlib import Path

DIAGLUX_ROOT = Path(os.environ.get("DIAGLUX_ROOT", "~/DiagLux-RAG")).expanduser()
LUX_ROOT = Path(os.environ.get("LUX_ROOT", "~/Lux-ano-pip")).expanduser()
OUT = Path(__file__).resolve().parent / "out"
WB = Path(__file__).resolve().parent.parent  # workbench root
TEXT_IDS = [f"text{i}" for i in range(1, 17)]

# Lux annotator id -> workbench annotator id
ENCODERS = {"luxembert": "luxembert", "modernbert": "modernbert", "xlm-roberta": "xlm_roberta"}
LLMS = {"claude-opus-4-6": "claude_opus_4_6", "gpt-5.4": "gpt_5_4", "deepseek-chat": "deepseek"}
LLM_PARADIGM = "few_shot"  # one representative paradigm per model for the per-text matrix

META = json.loads((WB / "public/data/meta.json").read_text(encoding="utf-8"))
CATS = META["categories"]  # lowercase id -> {label, regime, excluded}


def clean_body(text_id):
    raw = (DIAGLUX_ROOT / "dataset/Texts" / f"{text_id}.txt").read_text(encoding="utf-8")
    if "\r\n" in raw:
        raw = raw.replace("\r\n", "\n")
    body = raw.split("\n", 1)[1].split("\n", 1)[1]
    return unicodedata.normalize("NFC", body)


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


# --------------------------- gold occurrence location (de-newlining index)
def locate_occurrences(body, surfaces):
    """Locate ordered gold surfaces on the clean body, tolerating tokens glued
    at former line breaks by searching a newline-free projection."""
    orig_pos = [i for i, ch in enumerate(body) if ch != "\n"]
    denew = "".join(body[i] for i in orig_pos)
    occ, cursor, located = [], 0, 0
    for s in surfaces:
        sd = s.replace("\n", "")
        if not sd:
            continue
        i = denew.find(sd, cursor)
        if i < 0:
            i = denew.find(sd)  # fall back to a global search
        if i < 0:
            continue
        a = orig_pos[i]
        b = orig_pos[i + len(sd) - 1] + 1
        occ.append({"start": a, "end": b, "surface": body[a:b]})
        located += 1
        cursor = i + len(sd)
    return occ, located


# --------------------------- source loaders (surface bags per text/category)
def load_gold():
    out = {}  # text_id -> {CAT_upper: [surface,...]}
    for r in read_jsonl(LUX_ROOT / "src/lux_ano/texts_clean/gold_reference.jsonl"):
        out[r["text_id"]] = r["annotations"]
    return out


def load_encoder(enc_dir):
    out = {}  # text_id -> {CAT_upper: [...]}
    for fn in glob.glob(str(LUX_ROOT / f"output/finetune/{enc_dir}/fold*/predictions.jsonl")):
        for r in read_jsonl(fn):
            out[r["text_id"]] = r["annotations"]
    return out


def parse_inline_tags(raw):
    """Inline-tagged text -> {cat_lower: [surface,...]}. Consecutive <TAG>s
    all apply to the next word token."""
    out, pending = {}, []
    for tok in raw.split():
        m = re.fullmatch(r"<([A-Z][A-Z0-9-]*)>", tok)
        if m:
            pending.append(m.group(1).lower())
        else:
            word = tok.strip(".,!?;:\"'()»«…").strip()
            if word:
                for cat in pending:
                    out.setdefault(cat, []).append(word)
            pending = []
    return out


def load_llm(model_id):
    out = {}  # text_id -> {cat_lower: [...]}
    for r in read_jsonl(LUX_ROOT / "output/v8/annotations_research-16texts-may2026-v8.jsonl"):
        if r["model_id"] == model_id and LLM_PARADIGM in r["prompt_id"]:
            out[r["text_id"]] = parse_inline_tags(r.get("raw_output") or "")
    return out


def cat_get(bag, cat_lower):
    """Case-insensitive category lookup (gold/encoders use UPPERCASE keys)."""
    if cat_lower in bag:
        return bag[cat_lower]
    up = cat_lower.upper()
    return bag.get(up, [])


# --------------------------- annotations.json
def build_annotations():
    gold = load_gold()
    encoders = {aid: load_encoder(d) for d, aid in ENCODERS.items()}
    llms = {aid: load_llm(mid) for mid, aid in LLMS.items()}

    rows, total_gold, total_located = [], 0, 0
    for tid in TEXT_IDS:
        body = clean_body(tid)
        for cat in CATS:
            gsurf = list(cat_get(gold.get(tid, {}), cat))
            preds = {"gold": gsurf}
            for aid, data in encoders.items():
                preds[aid] = list(cat_get(data.get(tid, {}), cat))
            for aid, data in llms.items():
                preds[aid] = list(cat_get(data.get(tid, {}), cat))
            # keep the row only if something is annotated here
            if not any(preds.values()):
                continue
            occ, located = locate_occurrences(body, gsurf)
            total_gold += len(gsurf)
            total_located += located
            rows.append({
                "text_id": tid, "category": cat,
                "gold_occurrences": occ,          # located subset, for highlighting
                "predictions": preds,             # full surface bags, for counts
            })
    (OUT / "annotations.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    return rows, total_gold, total_located


# --------------------------- F1 tables from comparison.md
def _lead_pct(cell):
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*%", cell)
    return float(m.group(1)) if m else None


def parse_comparison():
    text = (LUX_ROOT / "output/finetune/comparison.md").read_text(encoding="utf-8")
    lines = text.splitlines()

    # aggregate_f1: rows "| name | LLM/Encoder | micro% | macro% |"
    NAME = {**LLMS, **ENCODERS}
    aggregate = {}
    for ln in lines:
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        name = cells[0].split("(")[0].strip() if cells else ""
        if len(cells) == 4 and name in NAME and cells[1] in ("LLM", "Encoder"):
            aggregate[NAME[name]] = {
                "micro": _lead_pct(cells[2]), "macro": _lead_pct(cells[3]),
                "type": "llm" if cells[1] == "LLM" else "encoder",
            }

    # per_category_f1: header names the model columns
    per_cat, header = {}, None
    for ln in lines:
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if cells and cells[0] == "Category" and "luxembert" in ln:
            header = cells
            continue
        if header and cells and cells[0].isupper() and "-" in cells[0]:
            row = dict(zip(header, cells))
            cat = cells[0].lower()
            if cat not in CATS:
                continue
            llm_vals = [_lead_pct(row.get(k, "")) for k in ("claude-opus-4-6", "deepseek-chat", "gpt-5.4")]
            llm_vals = [v for v in llm_vals if v is not None]
            entry = {
                "best_llm": max(llm_vals) if llm_vals else None,
                "luxembert": _lead_pct(row.get("luxembert", "")),
                "modernbert": _lead_pct(row.get("modernbert", "")),
                "xlm_roberta": _lead_pct(next((row[k] for k in row if k.startswith("xlm-roberta")), "")),
                "regime": CATS[cat].get("regime"),
            }
            if any(v is not None for v in (entry["best_llm"], entry["luxembert"], entry["modernbert"], entry["xlm_roberta"])):
                per_cat[cat] = entry
    return aggregate, per_cat


def main():
    rows, tg, tl = build_annotations()
    cov = (tl / tg) if tg else 0
    print(f"annotations.json: {len(rows)} rows | gold occurrences located {tl}/{tg} ({cov:.0%})")

    aggregate, per_cat = parse_comparison()
    (OUT / "aggregates_luxano.json").write_text(
        json.dumps({"per_category_f1": per_cat, "aggregate_f1": aggregate}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"aggregate_f1: {len(aggregate)} annotators | per_category_f1: {len(per_cat)} categories")

    # round-trip validation for located gold occurrences
    bad = 0
    bodies = {t: clean_body(t) for t in TEXT_IDS}
    for r in rows:
        b = bodies[r["text_id"]]
        for o in r["gold_occurrences"]:
            if b[o["start"]:o["end"]] != o["surface"]:
                bad += 1
    print(f"gold occurrence round-trip mismatches: {bad} {'OK' if bad == 0 else 'FAIL'}")

    # merge aggregates
    diag = json.loads((OUT / "aggregates_diaglux.json").read_text(encoding="utf-8"))
    merged = {**diag, "per_category_f1": per_cat, "aggregate_f1": aggregate}
    (OUT / "aggregates.json").write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
    print("aggregates.json assembled (retrieval_trap, evidence_recall_curves, control_accuracy, per_category_f1, aggregate_f1)")

    ok = bad == 0 and len(aggregate) >= 6 and len(per_cat) >= 8
    print("\nLUX-ANO EXPORT VALIDATION:", "PASS ✅" if ok else "FAIL ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
