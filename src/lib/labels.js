// Human-readable labels for texts and questions. Raw ids like "text9_q03" mean
// nothing to a reviewer, so everywhere a text or question is shown we prefer the
// English story title (from the guide glosses) and a friendly 1-based number.

export function textTitle(textId, textGlosses) {
  return textGlosses?.[textId]?.title_en || textId;
}

// "text9_q03" -> 4  (ids are 0-based; display 1-based)
export function questionNumber(questionId) {
  const m = /_q0*(\d+)$/.exec(questionId || "");
  return m ? Number(m[1]) + 1 : null;
}

// "The Substitute Schoolmaster · Q4"
export function questionLabel(question, textGlosses) {
  if (!question) return "";
  const t = textTitle(question.text_id, textGlosses);
  const n = questionNumber(question.question_id);
  return n ? `${t} · Q${n}` : t;
}
