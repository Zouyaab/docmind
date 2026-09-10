export interface LLMCompleteOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface LLMProvider {
  readonly name: string;
  complete(prompt: string, options?: LLMCompleteOptions): Promise<string>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
