import type { LLMProvider, EmbeddingProvider } from "@docmind/ai";
import type { Evidence } from "@docmind/core";
import type { SearchOptions, VectorStore } from "@docmind/retrieval";
import {
  detectConflictingEvidence,
  selectSupportingCitations,
  type CitationCandidate,
  type EvidenceConflict,
} from "./citations.js";
import { isAnswerGrounded } from "./grounding.js";
import { buildRagPrompt, containsInjectionAttempt, sanitizeUntrustedContext } from "./prompt.js";

export interface AnswerQuestionInput {
  query: string;
  store: VectorStore;
  llm: LLMProvider;
  embedding: EmbeddingProvider;
  topK?: number;
  minScore?: number;
  documentId?: string;
}

export interface AnswerQuestionResult {
  answer: string;
  citations: Evidence[];
  injectionBlocked?: boolean;
  insufficientEvidence?: boolean;
  grounded?: boolean;
  citationValidated?: boolean;
  conflicts?: EvidenceConflict[];
  scores?: number[];
}

const DEFAULT_MIN_SCORE = 0;

const INSUFFICIENT_MESSAGE =
  "Insufficient evidence: no sufficiently relevant passages were retrieved to answer confidently.";

const UNGROUNDED_MESSAGE =
  "Insufficient evidence: the model response was not adequately supported by retrieved passages.";

const CONFLICT_MESSAGE =
  "Conflicting evidence: retrieved passages disagree on key numeric facts; review required before acting.";

export async function answerQuestion(input: AnswerQuestionInput): Promise<AnswerQuestionResult> {
  if (containsInjectionAttempt(input.query)) {
    return {
      answer: "Query blocked: potential prompt injection detected.",
      citations: [],
      injectionBlocked: true,
      grounded: false,
      citationValidated: false,
    };
  }

  const [queryVector] = await input.embedding.embed([input.query]);
  const searchOptions: SearchOptions = {
    topK: input.topK ?? 5,
    minScore: input.minScore ?? DEFAULT_MIN_SCORE,
  };
  if (input.documentId) {
    searchOptions.documentId = input.documentId;
  }

  const hits = await input.store.search(queryVector ?? [], searchOptions);

  if (hits.length === 0) {
    return {
      answer: INSUFFICIENT_MESSAGE,
      citations: [],
      insufficientEvidence: true,
      grounded: false,
      citationValidated: false,
      scores: [],
    };
  }

  const contexts: CitationCandidate[] = hits.map((hit) => {
    const candidate: CitationCandidate = {
      text: sanitizeUntrustedContext(hit.record.text),
      chunkId: hit.record.chunkId,
      documentId: hit.record.documentId,
      score: hit.score,
    };
    if (typeof hit.record.metadata?.pageNumber === "number") {
      candidate.page = hit.record.metadata.pageNumber;
    }
    return candidate;
  });

  const conflicts = detectConflictingEvidence(contexts);
  if (conflicts.length > 0) {
    return {
      answer: CONFLICT_MESSAGE,
      citations: selectSupportingCitations(contexts.map((c) => c.text).join(" "), contexts),
      insufficientEvidence: true,
      grounded: false,
      citationValidated: false,
      conflicts,
      scores: contexts.map((c) => c.score ?? 0),
    };
  }

  const prompt = buildRagPrompt(
    input.query,
    contexts.map((c) => ({ text: c.text, chunkId: c.chunkId })),
  );

  const completion = await input.llm.complete([{ role: "user", content: prompt }]);
  const answerText = completion.text.trim();
  const evidenceTexts = contexts.map((c) => c.text);
  const grounded = isAnswerGrounded(answerText, evidenceTexts);

  if (!grounded || answerText.length === 0) {
    return {
      answer: UNGROUNDED_MESSAGE,
      citations: [],
      insufficientEvidence: true,
      grounded: false,
      citationValidated: false,
      scores: contexts.map((c) => c.score ?? 0),
    };
  }

  const citations = selectSupportingCitations(answerText, contexts);
  if (citations.length === 0) {
    return {
      answer: UNGROUNDED_MESSAGE,
      citations: [],
      insufficientEvidence: true,
      grounded: false,
      citationValidated: false,
      scores: contexts.map((c) => c.score ?? 0),
    };
  }

  return {
    answer: answerText,
    citations,
    grounded: true,
    citationValidated: true,
    scores: contexts.map((c) => c.score ?? 0),
  };
}
