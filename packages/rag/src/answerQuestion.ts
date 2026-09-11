import type { LLMProvider, EmbeddingProvider } from "@docmind/ai";
import type { Evidence } from "@docmind/core";
import type { SearchOptions, VectorStore } from "@docmind/retrieval";
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
  scores?: number[];
}

const DEFAULT_MIN_SCORE = 0;

export async function answerQuestion(input: AnswerQuestionInput): Promise<AnswerQuestionResult> {
  if (containsInjectionAttempt(input.query)) {
    return {
      answer: "Query blocked: potential prompt injection detected.",
      citations: [],
      injectionBlocked: true,
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
      answer:
        "Insufficient evidence: no sufficiently relevant passages were retrieved to answer confidently.",
      citations: [],
      insufficientEvidence: true,
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
    answer: completion.text,
    citations,
    scores: contexts.map((c) => c.score),
  };
}
