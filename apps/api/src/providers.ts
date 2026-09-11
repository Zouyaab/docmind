import {
  createMockProviders,
  OllamaEmbeddingProvider,
  OllamaLLMProvider,
  type EmbeddingProvider,
  type LLMProvider,
} from "@docmind/ai";
import type { DocMindConfig } from "@docmind/config";

export function createProvidersFromConfig(config: DocMindConfig): {
  llm: LLMProvider;
  embedding: EmbeddingProvider;
} {
  const mock = createMockProviders(config.EMBEDDING_DIMENSIONS);
  const llm =
    config.AI_PROVIDER === "ollama"
      ? new OllamaLLMProvider({
          baseUrl: config.OLLAMA_BASE_URL,
          model: config.OLLAMA_MODEL,
          timeoutMs: config.OLLAMA_TIMEOUT_MS,
          retries: config.OLLAMA_RETRIES,
        })
      : mock.llm;

  const embedding =
    config.EMBEDDING_PROVIDER === "ollama"
      ? new OllamaEmbeddingProvider({
          baseUrl: config.OLLAMA_BASE_URL,
          model: config.OLLAMA_EMBED_MODEL,
          timeoutMs: config.OLLAMA_TIMEOUT_MS,
          retries: config.OLLAMA_RETRIES,
        })
      : mock.embedding;

  return { llm, embedding };
}
