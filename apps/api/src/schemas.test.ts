import { describe, expect, it } from "vitest";
import { askSchema, decideSchema, documentIdSchema, searchSchema } from "./schemas.js";

describe("API request schemas", () => {
  it("accepts valid document ids and rejects path traversal", () => {
    expect(documentIdSchema.parse("doc_abc-123")).toBe("doc_abc-123");
    expect(() => documentIdSchema.parse("../etc/passwd")).toThrow(/Invalid document id/);
    expect(() => documentIdSchema.parse("")).toThrow();
  });

  it("validates search payloads strictly", () => {
    expect(searchSchema.parse({ query: "notice period", topK: 3 })).toEqual({
      query: "notice period",
      topK: 3,
    });
    expect(() => searchSchema.parse({ query: "" })).toThrow();
    expect(() => searchSchema.parse({ query: "ok", extra: true })).toThrow();
  });

  it("validates ask payloads including optional score bounds", () => {
    expect(askSchema.parse({ query: "What is the notice?", minScore: 0.2 })).toMatchObject({
      query: "What is the notice?",
      minScore: 0.2,
    });
    expect(() => askSchema.parse({ query: "x", minScore: 1.5 })).toThrow();
    expect(() => askSchema.parse({ topK: 5 })).toThrow();
  });

  it("requires a safe documentId for decide", () => {
    expect(decideSchema.parse({ documentId: "doc_1" })).toEqual({ documentId: "doc_1" });
    expect(() => decideSchema.parse({ documentId: "bad id!" })).toThrow();
    expect(() => decideSchema.parse({})).toThrow();
  });
});
