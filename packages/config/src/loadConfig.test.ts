import { describe, expect, it } from "vitest";
import { DocMindError } from "@docmind/core";
import { loadConfig } from "./loadConfig.js";

describe("loadConfig", () => {
  it("applies defaults when env is empty", () => {
    const config = loadConfig({});
    expect(config.API_PORT).toBe(3000);
    expect(config.API_HOST).toBe("127.0.0.1");
    expect(config.MAX_UPLOAD_BYTES).toBe(10_485_760);
    expect(config.OLLAMA_BASE_URL).toBe("http://127.0.0.1:11434");
    expect(config.OLLAMA_MODEL).toBe("llama3.2");
    expect(config.OLLAMA_EMBED_MODEL).toBe("nomic-embed-text");
    expect(config.AI_PROVIDER).toBe("mock");
    expect(config.EMBEDDING_PROVIDER).toBe("mock");
    expect(config.EMBEDDING_DIMENSIONS).toBe(32);
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.RAG_MIN_SCORE).toBe(0);
    expect(config.RATE_LIMIT_MAX).toBe(120);
  });

  it("parses overrides from env", () => {
    const config = loadConfig({
      API_PORT: "8080",
      API_HOST: "0.0.0.0",
      MAX_UPLOAD_BYTES: "2048",
      OLLAMA_BASE_URL: "http://localhost:11434",
      OLLAMA_MODEL: "mistral",
      DATABASE_URL: "postgres://user:pass@localhost:5432/docmind",
      LOG_LEVEL: "debug",
      API_TOKEN: "secret-token",
      AI_PROVIDER: "ollama",
      EMBEDDING_DIMENSIONS: "32",
    });

    expect(config.API_PORT).toBe(8080);
    expect(config.API_HOST).toBe("0.0.0.0");
    expect(config.MAX_UPLOAD_BYTES).toBe(2048);
    expect(config.OLLAMA_MODEL).toBe("mistral");
    expect(config.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/docmind");
    expect(config.LOG_LEVEL).toBe("debug");
    expect(config.API_TOKEN).toBe("secret-token");
    expect(config.AI_PROVIDER).toBe("ollama");
  });

  it("treats empty strings as unset optional values", () => {
    const config = loadConfig({
      DATABASE_URL: "",
      API_TOKEN: "",
    });
    expect(config.DATABASE_URL).toBeUndefined();
    expect(config.API_TOKEN).toBeUndefined();
  });

  it("throws DocMindError on invalid values", () => {
    expect(() => loadConfig({ API_PORT: "not-a-number" })).toThrow(DocMindError);
    expect(() => loadConfig({ OLLAMA_BASE_URL: "not-a-url" })).toThrow(DocMindError);
    expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow(DocMindError);
  });
});
