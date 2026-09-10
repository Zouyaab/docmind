import { describe, expect, it } from "vitest";
import { createMockProviders } from "@docmind/ai";
import { classifyDocument } from "./classify.js";

describe("classifyDocument", () => {
  it("classifies invoice heuristically", async () => {
    const text = `INVOICE #12345
Bill To: Acme Corp
Amount Due: $500.00
Total Due: $500.00`;
    const result = await classifyDocument(text, { documentId: "doc-1" });
    expect(result.documentType).toBe("invoice");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("classifies contract heuristically", async () => {
    const text = `SERVICE AGREEMENT
This contract is between Party A and Party B.
Termination requires 14 days notice. Auto-renewal applies.`;
    const result = await classifyDocument(text);
    expect(result.documentType).toBe("contract");
  });

  it("uses LLM when provided", async () => {
    const { llm } = createMockProviders();
    const result = await classifyDocument("Invoice total due $100", { llm });
    expect(result.documentType).toBe("invoice");
  });
});
