import { MockEmbeddingProvider } from "./mockEmbedding.js";
import { MockLLMProvider } from "./mockLlm.js";

export type { LLMProvider, EmbeddingProvider, LLMCompleteOptions } from "./types.js";
export { MockLLMProvider } from "./mockLlm.js";
export { MockEmbeddingProvider, hashToVector } from "./mockEmbedding.js";
export { OllamaLLMProvider, OllamaEmbeddingProvider, type OllamaOptions } from "./ollama.js";

export function createMockProviders(dimensions = 64): {
  llm: MockLLMProvider;
  embedding: MockEmbeddingProvider;
} {
  return {
    llm: new MockLLMProvider(),
    embedding: new MockEmbeddingProvider(dimensions),
  };
}
