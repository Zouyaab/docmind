import { describe, expect, it, vi } from "vitest";
import { DocMindError } from "@docmind/core";
import { OllamaLLMProvider } from "./ollamaProviders.js";

describe("OllamaLLMProvider", () => {
  it("completes with timeout/retry options and parses content", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ message: { content: "hello from ollama" } }),
    ) as unknown as typeof fetch;
    const provider = new OllamaLLMProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "llama3.2",
      fetchImpl,
      timeoutMs: 1000,
      retries: 0,
    });
    const result = await provider.complete([{ role: "user", content: "hi" }]);
    expect(result.text).toBe("hello from ollama");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("surfaces structured errors on HTTP failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("nope", { status: 503 }),
    ) as unknown as typeof fetch;
    const provider = new OllamaLLMProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "llama3.2",
      fetchImpl,
      retries: 0,
    });
    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(
      DocMindError,
    );
  });
});
