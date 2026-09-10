import { describe, expect, it } from "vitest";
import { chunkText } from "./chunkText.js";

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("doc-1", "")).toEqual([]);
  });

  it("creates a single chunk for short text", () => {
    const chunks = chunkText("doc-1", "short text", { pageNumber: 1 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      documentId: "doc-1",
      text: "short text",
      startOffset: 0,
      endOffset: 10,
      pageNumber: 1,
    });
  });

  it("splits long text with offsets", () => {
    const text = "word ".repeat(300).trim();
    const chunks = chunkText("doc-1", text, { maxChars: 100, overlapChars: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.startOffset).toBe(0);
    expect(chunks.at(-1)!.endOffset).toBe(text.length);
    for (const chunk of chunks) {
      expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.text);
    }
  });

  it("rejects invalid maxChars", () => {
    expect(() => chunkText("doc-1", "x", { maxChars: 0 })).toThrow(RangeError);
  });
});
