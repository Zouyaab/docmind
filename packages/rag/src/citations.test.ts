import { describe, expect, it } from "vitest";
import { detectConflictingEvidence, selectSupportingCitations } from "./citations.js";

describe("citation validation", () => {
  it("keeps only citations that overlap the answer", () => {
    const citations = selectSupportingCitations(
      "Termination requires thirty days written notice.",
      [
        {
          documentId: "doc-1",
          chunkId: "c1",
          text: "Termination requires 30 days written notice.",
        },
        {
          documentId: "doc-1",
          chunkId: "c2",
          text: "The office address is 100 Market Street.",
        },
      ],
    );

    expect(citations).toHaveLength(1);
    expect(citations[0]?.chunkId).toBe("c1");
  });

  it("returns no citations when the answer has no significant overlap", () => {
    const citations = selectSupportingCitations("Completely unrelated fabrication about rockets.", [
      {
        documentId: "doc-1",
        chunkId: "c1",
        text: "Termination requires 30 days written notice.",
      },
    ]);
    expect(citations).toEqual([]);
  });

  it("detects conflicting numeric evidence across chunks", () => {
    const conflicts = detectConflictingEvidence([
      {
        documentId: "doc-1",
        chunkId: "c1",
        text: "Notice period is 14 days for termination.",
      },
      {
        documentId: "doc-1",
        chunkId: "c2",
        text: "Termination notice period is 30 days.",
      },
    ]);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some((conflict) => conflict.values.includes("14"))).toBe(true);
    expect(conflicts.some((conflict) => conflict.values.includes("30"))).toBe(true);
  });

  it("does not flag consistent numeric evidence as a conflict", () => {
    const conflicts = detectConflictingEvidence([
      {
        documentId: "doc-1",
        chunkId: "c1",
        text: "Notice period is 30 days.",
      },
      {
        documentId: "doc-1",
        chunkId: "c2",
        text: "The termination notice remains 30 days.",
      },
    ]);
    expect(conflicts).toEqual([]);
  });
});
