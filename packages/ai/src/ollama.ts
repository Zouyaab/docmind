import { DocMindError } from "@docmind/core";
import type { EmbeddingProvider, LLMCompleteOptions, LLMProvider } from "./types.js";

export interface OllamaOptions {
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
}

export class OllamaLLMProvider implements LLMProvider {
  readonly name = "ollama-llm";
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(options: OllamaOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    this.model = options.model ?? "llama3.2";
  }

  async complete(prompt: string, options?: LLMCompleteOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        format: options?.json ? "json" : undefined,
        options: {
          temperature: options?.temperature ?? 0.2,
          num_predict: options?.maxTokens ?? 512,
        },
      }),
    });

    if (!response.ok) {
      throw new DocMindError("OLLAMA_ERROR", `Ollama request failed: ${response.statusText}`, 502);
    }

    const body = (await response.json()) as { response?: string };
    return body.response ?? "";
  }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama-embedding";
  readonly dimensions = 768;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(options: OllamaOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    this.model = options.embeddingModel ?? "nomic-embed-text";
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!response.ok) {
        throw new DocMindError(
          "OLLAMA_ERROR",
          `Ollama embedding failed: ${response.statusText}`,
          502,
        );
      }

      const body = (await response.json()) as { embedding?: number[] };
      vectors.push(body.embedding ?? []);
    }
    return vectors;
  }
}
