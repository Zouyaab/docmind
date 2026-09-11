const STOP_WORDS = new Set([
  "about",
  "after",
  "based",
  "because",
  "could",
  "document",
  "excerpts",
  "from",
  "have",
  "provided",
  "should",
  "their",
  "there",
  "these",
  "this",
  "those",
  "which",
  "would",
  "with",
]);

/** Tokens used for lightweight lexical grounding checks. */
export function significantTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

/**
 * Returns true when the answer shares enough significant tokens with evidence.
 * This is a safeguard against unsupported answers, not a semantic NLI model.
 */
export function isAnswerGrounded(answer: string, evidenceTexts: string[]): boolean {
  const answerTokens = significantTokens(answer);
  if (answerTokens.size === 0) {
    return false;
  }

  let overlap = 0;
  for (const evidence of evidenceTexts) {
    const evidenceTokens = significantTokens(evidence);
    for (const token of answerTokens) {
      if (evidenceTokens.has(token)) {
        overlap += 1;
      }
    }
  }

  return overlap >= 2 || overlap / answerTokens.size >= 0.3;
}
