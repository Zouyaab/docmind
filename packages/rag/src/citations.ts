import type { Evidence } from "@docmind/core";
import { significantTokens } from "./grounding.js";

export interface CitationCandidate {
  documentId: string;
  chunkId: string;
  text: string;
  page?: number;
  score?: number;
}

export interface EvidenceConflict {
  /** Lightweight hint such as a shared keyword near disagreeing values. */
  topic: string;
  values: string[];
  chunkIds: string[];
}

/**
 * Keep only citations that lexically support the answer.
 * Citations that do not overlap the answer are dropped (not silently trusted).
 */
export function selectSupportingCitations(
  answer: string,
  candidates: CitationCandidate[],
): Evidence[] {
  const answerTokens = significantTokens(answer);
  if (answerTokens.size === 0) {
    return [];
  }

  const supporting: Evidence[] = [];
  for (const candidate of candidates) {
    const evidenceTokens = significantTokens(candidate.text);
    let overlap = 0;
    for (const token of answerTokens) {
      if (evidenceTokens.has(token)) overlap += 1;
    }
    if (overlap === 0) continue;

    const evidence: Evidence = {
      documentId: candidate.documentId,
      chunkId: candidate.chunkId,
      text: candidate.text.slice(0, 300),
    };
    if (candidate.page !== undefined) {
      evidence.page = candidate.page;
    }
    supporting.push(evidence);
  }
  return supporting;
}

function normalizeUnit(raw: string | undefined): string {
  if (!raw) return "value";
  return raw.replace(/%/g, "percent").replace(/\$/g, "usd").replace(/days?/g, "days");
}

/**
 * Detect obvious numeric conflicts across retrieved passages (e.g. 14 days vs 30 days).
 * Mentions conflict when they share a unit, disagree on value, and share topical tokens.
 * This is a conservative heuristic for decision support, not full NLI.
 */
export function detectConflictingEvidence(candidates: CitationCandidate[]): EvidenceConflict[] {
  interface Mention {
    value: string;
    unit: string;
    chunkId: string;
    contextTokens: Set<string>;
  }

  const mentions: Mention[] = [];

  for (const candidate of candidates) {
    const lowered = candidate.text.toLowerCase();
    const docTokens = significantTokens(lowered);
    const matches = lowered.matchAll(
      /\b(\d+(?:\.\d+)?)\s*(days?|day|percent|%|months?|years?|usd|\$)?\b/g,
    );
    for (const match of matches) {
      const value = match[1] ?? "";
      const unit = normalizeUnit(match[2]);
      const contextTokens = new Set(docTokens);
      contextTokens.delete(value);
      mentions.push({
        value,
        unit,
        chunkId: candidate.chunkId,
        contextTokens,
      });
    }
  }

  const byUnit = new Map<string, Mention[]>();
  for (const mention of mentions) {
    const list = byUnit.get(mention.unit) ?? [];
    list.push(mention);
    byUnit.set(mention.unit, list);
  }

  const conflicts: EvidenceConflict[] = [];
  for (const [unit, unitMentions] of byUnit) {
    const distinctValues = new Set(unitMentions.map((m) => m.value));
    if (distinctValues.size < 2) continue;

    const conflictValues = new Set<string>();
    const conflictChunks = new Set<string>();

    for (let i = 0; i < unitMentions.length; i++) {
      for (let j = i + 1; j < unitMentions.length; j++) {
        const a = unitMentions[i]!;
        const b = unitMentions[j]!;
        if (a.value === b.value) continue;
        const sharesTopic = [...a.contextTokens].some((token) => b.contextTokens.has(token));
        if (!sharesTopic) continue;
        conflictValues.add(a.value);
        conflictValues.add(b.value);
        conflictChunks.add(a.chunkId);
        conflictChunks.add(b.chunkId);
      }
    }

    if (conflictValues.size >= 2) {
      conflicts.push({
        topic: unit,
        values: [...conflictValues],
        chunkIds: [...conflictChunks],
      });
    }
  }

  return conflicts;
}
