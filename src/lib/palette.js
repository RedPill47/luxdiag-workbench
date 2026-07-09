// Central colour vocabulary. The four trap-class colours carry meaning
// (brief §7); regime hues are muted and deliberately distinct from them so
// green/amber/red/gray keep reading as the trap semantics everywhere else.

export const REGIME_COLORS = {
  1: "#2f8a7e", // surface patterns
  2: "#5b6bb5", // discourse / syntax
  3: "#a15a8a", // world knowledge
};
export const EXCLUDED_COLOR = "#9ca3af";

export function regimeColor(regime, excluded) {
  if (excluded) return EXCLUDED_COLOR;
  return REGIME_COLORS[regime] ?? EXCLUDED_COLOR;
}

// Critical / distractor spans sit on the same good/bad axis as the trap
// classes, so they borrow the green/red tints (as backgrounds, per §7).
export const CRITICAL_TINT = "rgba(47, 138, 91, 0.20)";
export const DISTRACTOR_TINT = "rgba(192, 69, 59, 0.18)";
export const BOTH_TINT =
  "linear-gradient(120deg, rgba(47,138,91,0.22) 0 50%, rgba(192,69,59,0.20) 50% 100%)";

// Trap-class badge/bar colours (mirror meta.json retrieval_trap_classes).
export const TRAP_COLORS = {
  critical_only: "#2f8a5b",
  both: "#c98a1e",
  distractor_only: "#c0453b",
  neither: "#6b7280",
};

// Annotation agreement statuses (vs. gold) and annotator-type accents.
export const ANNOT_COLORS = {
  matched: "#2f8a5b", // predicted, in gold
  spurious: "#c0453b", // predicted, not in gold
  missed: "#c98a1e", // gold, not predicted
};
export const ANNOTATOR_TYPE_COLORS = {
  reference: "#6b7280",
  encoder: "#2f5d8a",
  llm: "#a15a8a",
};
