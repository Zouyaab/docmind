import { describe, expect, it } from "vitest";
import { chunkExtractedDocument } from "./chunkDocument.js";

describe("chunkExtractedDocument", () => {
  it("assigns page numbers and section headings from form-feed pages", () => {
    const chunks = chunkExtractedDocument("doc-1", {
      text: "INTRODUCTION\nAlpha clause.\fTERMS\nBeta clause with more text.",
      pageCount: 2,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((chunk) => chunk.pageNumber === 1)).toBe(true);
    expect(chunks.some((chunk) => chunk.pageNumber === 2)).toBe(true);
    expect(chunks.find((chunk) => chunk.pageNumber === 1)?.metadata?.section).toBe("INTRODUCTION");
    expect(chunks.find((chunk) => chunk.pageNumber === 2)?.metadata?.section).toBe("TERMS");
    expect(chunks[0]?.metadata?.provenance).toBe("page-aware");
  });

  it("uses explicit extraction pages when provided", () => {
    const chunks = chunkExtractedDocument("doc-2", {
      text: "ignored when pages present",
      pageCount: 2,
      pages: [
        { pageNumber: 1, text: "# Overview\nPage one body." },
        { pageNumber: 2, text: "# Details\nPage two body." },
      ],
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      pageNumber: 1,
      metadata: { section: "Overview", provenance: "page-aware", documentPageCount: 2 },
    });
    expect(chunks[1]?.pageNumber).toBe(2);
  });

  it("falls back to a single page for plain text without markers", () => {
    const chunks = chunkExtractedDocument("doc-3", {
      text: "Plain agreement text without page breaks.",
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.pageNumber).toBe(1);
    expect(chunks[0]?.metadata?.provenance).toBe("page-aware");
  });

  it("returns no chunks for empty extraction", () => {
    expect(chunkExtractedDocument("doc-4", { text: "   " })).toEqual([]);
  });
});
