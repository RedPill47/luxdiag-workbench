# Export pipeline

Builds the JSON bundle in `public/data/` from the two source studies.

| script | what it does |
|---|---|
| `export_diaglux.py` | LuxDiag-RAG study → texts, questions, chunks, retrieval, answers, aggregates |
| `export_luxano.py` | annotation study → annotation layer, per-category and aggregate F1 |
| `split_retrieval.py` | splits `out/retrieval.json` into per-question files the app lazy-loads |
| `revision_analysis.py` | reconciliation coverage, retrieval-trap table, accuracy by annotation category |
| `make_recall_figure.py` | regenerates the evidence-recall figure from the aggregates |

The two export scripts read the upstream study repositories; point them there
with `DIAGLUX_ROOT` and `LUX_ROOT` (defaults assume `~/DiagLux-RAG` and
`~/Lux-ano-pip`). They write to `export/out/`, which is not committed because
it duplicates `public/data/`; run the exports before the analysis scripts.

## Evidence overlap

A chunk carries a question's evidence only if it comes from that question's own
text **and** its character range overlaps the span. Testing offsets without the
text check lets a chunk of another text match by coincidence, which inflates
evidence recall and mis-assigns retrieval-trap classes. `revision_analysis.py`
recomputes trap classes from this rule rather than reading the stored field.
