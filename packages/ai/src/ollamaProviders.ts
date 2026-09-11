import { DocMindError } from "@docmind/core";
import type { EmbeddingProvider, LLMCompletionOptions, LLMMessage, LLMProvider } from "./types.js";

export interface OllamaLLMOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; retries: number; label: string },
): Promise<Response> {
  let lastError: unknown;
  const attempts = Math.max(1, options.retries + 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        throw new DocMindError("AI_ERROR", `${options.label} failed`, {
          status: response.status,
          attempt: attempt + 1,
        });
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt + 1 >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  if (DocMindError.isDocMindError(lastError)) {
    throw lastError;
  }
  throw new DocMindError("AI_UNAVAILABLE", `${options.label} unavailable after retries`, {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

export class OllamaLLMProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(options: OllamaLLMOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 1;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions,
  ): Promise<{ text: string }> {
    const response = await fetchWithRetry(
      this.fetchImpl,
      `${this.baseUrl}/api/chat`,
      {
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
      },
      { timeoutMs: this.timeoutMs, retries: this.retries, label: "Ollama chat" },
    );

    let payload: { message?: { content?: string } };
    try {
      payload = (await response.json()) as { message?: { content?: string } };
    } catch {
      throw new DocMindError("AI_ERROR", "Ollama returned malformed JSON", 502);
    }

    const text = payload.message?.content;
    if (typeof text !== "string") {
      throw new DocMindError("AI_ERROR", "Ollama chat response missing message content", 502);
    }
    return { text };
  }
}

export interface OllamaEmbeddingOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(options: OllamaEmbeddingOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 1;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];

    for (const text of texts) {
      const response = await fetchWithRetry(
        this.fetchImpl,
        `${this.baseUrl}/api/embeddings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: this.model, prompt: text }),
        },
        { timeoutMs: this.timeoutMs, retries: this.retries, label: "Ollama embeddings" },
      );

      let payload: { embedding?: number[] };
      try {
        payload = (await response.json()) as { embedding?: number[] };
      } catch {
        throw new DocMindError("AI_ERROR", "Ollama embedding returned malformed JSON", 502);
      }
      if (!Array.isArray(payload.embedding) || payload.embedding.length === 0) {
        throw new DocMindError("AI_ERROR", "Ollama embedding response missing vector", 502);
      }
      vectors.push(payload.embedding);
    }

    return vectors;
  }
}
