import { describe, expect, it } from "vitest";
import { MockEmbeddingProvider, MockLLMProvider } from "./mockProviders.js";

describe("MockLLMProvider", () => {
  it("returns heuristic classification JSON for classify prompts", async () => {
    const llm = new MockLLMProvider();
    const result = await llm.complete([{ role: "user", content: "classify this" }], { json: true });
    expect(JSON.parse(result.text)).toMatchObject({
      documentType: expect.any(String),
      confidence: expect.any(Number),
    });
  });

  it("returns default JSON for unrelated prompts", async () => {
    const llm = new MockLLMProvider();
    const result = await llm.complete([{ role: "user", content: "ping" }], { json: true });
    expect(JSON.parse(result.text)).toEqual({ ok: true });
  });

  it("matches configured rules", async () => {
    const llm = new MockLLMProvider({
      rules: [{ match: /invoice/i, response: '{"type":"invoice"}' }],
    });
    const result = await llm.complete([{ role: "user", content: "This is an invoice" }], {
      json: true,
    });
    expect(JSON.parse(result.text)).toEqual({ type: "invoice" });
  });
});

describe("MockEmbeddingProvider", () => {
  it("returns deterministic hash-based vectors", async () => {
    const provider = new MockEmbeddingProvider(32);
    const [a, b, aAgain] = await provider.embed(["hello", "world", "hello"]);
    expect(a).toHaveLength(32);
    expect(a).toEqual(aAgain);
    expect(a).not.toEqual(b);
  });
});
