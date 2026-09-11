import { describe, expect, it } from "vitest";
import { createDocumentRecord } from "@docmind/ingestion";
import { createMemoryStores } from "./memory.js";

describe("memory persistence stores", () => {
  it("persists documents, chunks, classifications, fields, vectors, and decisions", async () => {
    const stores = createMemoryStores();
    const doc = createDocumentRecord({
      filename: "a.txt",
      mimeType: "text/plain",
      hash: "abc",
      size: 3,
    });
    await stores.documents.save(doc);

    await stores.chunks.replaceForDocument(doc.id, [
      {
        id: "c1",
        documentId: doc.id,
        text: "Notice period is 14 days",
        startOffset: 0,
        endOffset: 24,
        metadata: { section: "terms" },
      },
    ]);
    expect(await stores.chunks.listByDocument(doc.id)).toHaveLength(1);

    await stores.classifications.save({
      documentId: doc.id,
      documentType: "contract",
      confidence: 0.9,
      band: "HIGH_CONFIDENCE",
      evidence: [],
      updatedAt: new Date().toISOString(),
    });
    expect((await stores.classifications.get(doc.id))?.documentType).toBe("contract");

    await stores.fields.save(doc.id, { noticePeriodDays: 14 });
    expect(await stores.fields.get(doc.id)).toEqual({ noticePeriodDays: 14 });

    await stores.vectors.upsert([
      {
        id: "v1",
        documentId: doc.id,
        chunkId: "c1",
        text: "Notice period is 14 days",
        vector: [1, 0, 0, 0],
      },
    ]);
    const hits = await stores.vectors.search([1, 0, 0, 0], 1);
    expect(hits[0]?.record.chunkId).toBe("c1");

    await stores.decisions.save(doc.id, {
      decision: "REVIEW_REQUIRED",
      riskScore: 40,
      risks: [],
      rulesEvaluated: 1,
      note: "test",
    });
    expect((await stores.decisions.latest(doc.id))?.decision).toBe("REVIEW_REQUIRED");
  });
});
