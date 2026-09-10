import { describe, expect, it } from "vitest";
import { DocMindError } from "@docmind/core";
import { loadConfig } from "./loadConfig.js";

describe("loadConfig", () => {
  it("applies defaults when env is empty", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      API_PORT: 3000,
      API_HOST: "127.0.0.1",
      MAX_UPLOAD_BYTES: 10_485_760,
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "llama3.2",
      LOG_LEVEL: "info",
    });
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
    });

    expect(config.API_PORT).toBe(8080);
    expect(config.API_HOST).toBe("0.0.0.0");
    expect(config.MAX_UPLOAD_BYTES).toBe(2048);
    expect(config.OLLAMA_MODEL).toBe("mistral");
    expect(config.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/docmind");
    expect(config.LOG_LEVEL).toBe("debug");
    expect(config.API_TOKEN).toBe("secret-token");
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
