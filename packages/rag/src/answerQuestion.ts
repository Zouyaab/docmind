import type { LLMProvider, EmbeddingProvider } from "@docmind/ai";
import type { Evidence } from "@docmind/core";
import type { VectorStore } from "@docmind/retrieval";
import { buildRagPrompt, containsInjectionAttempt } from "./prompt.js";

export interface AnswerQuestionInput {
  query: string;
  store: VectorStore;
  llm: LLMProvider;
  embedding: EmbeddingProvider;
  topK?: number;
}

export interface AnswerQuestionResult {
  answer: string;
  citations: Evidence[];
  injectionBlocked?: boolean;
}

export async function answerQuestion(input: AnswerQuestionInput): Promise<AnswerQuestionResult> {
  if (containsInjectionAttempt(input.query)) {
    return {
      answer: "Query blocked: potential prompt injection detected.",
      citations: [],
      injectionBlocked: true,
    };
  }

  const [queryVector] = await input.embedding.embed([input.query]);
  const hits = await input.store.search(queryVector ?? [], input.topK ?? 5);

  const contexts = hits.map((hit) => ({
    text: hit.record.text,
    chunkId: hit.record.chunkId,
    documentId: hit.record.documentId,
    score: hit.score,
  }));

  const prompt = buildRagPrompt(
    input.query,
    contexts.map((c) => ({ text: c.text, chunkId: c.chunkId })),
  );

  const answer = await input.llm.complete(prompt);

  const citations: Evidence[] = contexts.map((c) => ({
    documentId: c.documentId,
    chunkId: c.chunkId,
    text: c.text.slice(0, 300),
  }));

  return { answer, citations };
}
