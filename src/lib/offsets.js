// Pure span/offset utilities. Every offset here indexes into a text's
// `clean_text` (the shared coordinate system both studies use). These
// functions are defensive: a malformed offset is clamped, never thrown,
// so PassageView can render any data without crashing.

/** Clamp a span to [0, textLen] and normalize so start <= end. */
export function clampSpan(span, textLen) {
  const start = Math.max(0, Math.min(span.start ?? 0, textLen));
  const end = Math.max(start, Math.min(span.end ?? 0, textLen));
  return { ...span, start, end };
}

/**
 * Segment `text` at all overlay boundaries into contiguous, non-overlapping
 * runs. Each overlay must carry numeric `start`/`end` character offsets.
 *
 * Returns an ordered list covering the whole string:
 *   [{ start, end, text, overlays: [overlay, ...] }, ...]
 * where `overlays` is every input overlay that fully covers that run — so a
 * run that is both a critical span and a `morph-n-rule` category reports both.
 *
 * Out-of-bounds overlays are clamped; empty ones are dropped. A run with no
 * overlays is still emitted (plain text), so concatenating `text` across all
 * segments reproduces the input exactly.
 */
export function segmentText(text, overlays = []) {
  const len = text.length;
  const spans = overlays
    .map((o) => clampSpan(o, len))
    .filter((o) => o.end > o.start);

  // Every distinct boundary becomes a cut point.
  const points = new Set([0, len]);
  for (const s of spans) {
    points.add(s.start);
    points.add(s.end);
  }
  const cuts = [...points].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i];
    const end = cuts[i + 1];
    if (end <= start) continue;
    const covering = spans.filter((s) => s.start <= start && s.end >= end);
    segments.push({ start, end, text: text.slice(start, end), overlays: covering });
  }
  return segments;
}

/** True if any two of the given spans overlap in character range. */
export function hasOverlap(spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return true;
  }
  return false;
}
