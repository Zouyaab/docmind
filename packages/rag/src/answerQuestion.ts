import type { LLMProvider, EmbeddingProvider } from "@docmind/ai";
import type { Evidence } from "@docmind/core";
import type { SearchOptions, VectorStore } from "@docmind/retrieval";
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
  scores?: number[];
}

const DEFAULT_MIN_SCORE = 0;

const INSUFFICIENT_MESSAGE =
  "Insufficient evidence: no sufficiently relevant passages were retrieved to answer confidently.";

const UNGROUNDED_MESSAGE =
  "Insufficient evidence: the model response was not adequately supported by retrieved passages.";

export async function answerQuestion(input: AnswerQuestionInput): Promise<AnswerQuestionResult> {
  if (containsInjectionAttempt(input.query)) {
    return {
      answer: "Query blocked: potential prompt injection detected.",
      citations: [],
      injectionBlocked: true,
      grounded: false,
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
      scores: [],
    };
  }

  // Defense-in-depth: strip injection patterns from retrieved chunk text before prompting.
  const contexts = hits.map((hit) => ({
    text: sanitizeUntrustedContext(hit.record.text),
    chunkId: hit.record.chunkId,
    documentId: hit.record.documentId,
    score: hit.score,
    page:
      typeof hit.record.metadata?.pageNumber === "number"
        ? hit.record.metadata.pageNumber
        : undefined,
  }));

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
      scores: contexts.map((c) => c.score),
    };
  }

  const citations: Evidence[] = contexts.map((c) => {
    const evidence: Evidence = {
      documentId: c.documentId,
      chunkId: c.chunkId,
      text: c.text.slice(0, 300),
    };
    if (c.page !== undefined) {
      evidence.page = c.page;
    }
    return evidence;
  });

  return {
    answer: answerText,
    citations,
    grounded: true,
    scores: contexts.map((c) => c.score),
  };
}
