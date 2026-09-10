import { DocMindError } from "@docmind/core";
import type {
  EmbeddingProvider,
  LLMCompletionOptions,
  LLMMessage,
  LLMProvider,
} from "./types.js";

export interface OllamaLLMOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OllamaLLMProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaLLMOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<{ text: string }> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
        },
        format: options?.json ? "json" : undefined,
      }),
    });

    if (!response.ok) {
      throw new DocMindError("AI_ERROR", "Ollama chat request failed", {
        status: response.status,
      });
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    return { text: payload.message?.content ?? "" };
  }
}

export interface OllamaEmbeddingOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaEmbeddingOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];

    for (const text of texts) {
      const response = await this.fetchImpl(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!response.ok) {
        throw new DocMindError("AI_ERROR", "Ollama embedding request failed", {
          status: response.status,
        });
      }

      const payload = (await response.json()) as { embedding?: number[] };
      vectors.push(payload.embedding ?? []);
    }

    return vectors;
  }
}
