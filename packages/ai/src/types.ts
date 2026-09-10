export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface LLMCompletionResult {
  text: string;
}

export interface LLMProvider {
  complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResult>;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}
