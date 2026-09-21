#!/usr/bin/env python3
"""Regenerate paper/figures/fig_recall_curves.pdf from the released aggregates.

Run after export/revision_analysis.py (or any re-export), so the figure can
never drift from out/aggregates.json again.
"""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
curves = json.load(open(os.path.join(ROOT, "export/out/aggregates.json"),
                        encoding="utf-8"))["evidence_recall_curves"]["open_corpus"]
KS = [1, 3, 5, 10]
LEAD = {"bm25_char": ("BM25 (char)", "#0f766e", "-", "o"),
        "hybrid_w_char": ("Hybrid-w (char)", "#1f3a5f", "-", "s"),
        "bm25_word": ("BM25 (word)", "#b45309", "--", "^")}
GREY = {"dense_mE5": "Dense (mE5)", "dense_bge_m3": "Dense (BGE-M3)",
        "hybrid_rrf_char": "Hybrid-RRF (char)"}

fig, ax = plt.subplots(figsize=(5.0, 3.1))
for key, label in GREY.items():
    ax.plot(KS, [curves[key][str(k)] for k in KS], color="#b8bfc9",
            lw=1.2, marker=".", ms=4, zorder=1, label=label)
for key, (label, colour, ls, mk) in LEAD.items():
    ax.plot(KS, [curves[key][str(k)] for k in KS], color=colour, lw=1.9,
            ls=ls, marker=mk, ms=4.5, zorder=3, label=label)
ax.set_xlabel("$k$"); ax.set_ylabel("Evidence recall@$k$")
ax.set_xticks(KS); ax.set_xticklabels(KS)
ax.set_ylim(0.35, 0.95); ax.grid(alpha=.25, lw=.6)
for side in ("top", "right"):
    ax.spines[side].set_visible(False)
ax.legend(fontsize=7.2, loc="lower right", frameon=False, ncol=2)
fig.tight_layout(pad=0.3)
out = os.path.join(ROOT, "paper/figures/fig_recall_curves.pdf")
fig.savefig(out); print("wrote", out)
for k in ("bm25_word", "bm25_char", "hybrid_w_char"):
    print(f"  {k:16s}", {j: curves[k][str(j)] for j in KS})
