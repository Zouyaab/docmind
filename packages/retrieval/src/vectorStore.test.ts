import { describe, expect, it } from "vitest";
import { InMemoryVectorStore, cosineSimilarity } from "./vectorStore.js";

describe("InMemoryVectorStore", () => {
  it("upserts and searches by cosine similarity", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      {
        id: "v1",
        documentId: "d1",
        chunkId: "c1",
        text: "apple fruit",
        vector: [1, 0, 0],
      },
      {
        id: "v2",
        documentId: "d1",
        chunkId: "c2",
        text: "banana fruit",
        vector: [0.9, 0.1, 0],
      },
      {
        id: "v3",
        documentId: "d2",
        chunkId: "c3",
        text: "car vehicle",
        vector: [0, 1, 0],
      },
    ]);

    const results = await store.search([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.record.chunkId).toBe("c1");
    expect(results[0]!.score).toBeCloseTo(1, 5);
  });

  it("deletes by document id", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([{ id: "v1", documentId: "d1", chunkId: "c1", text: "a", vector: [1] }]);
    await store.deleteByDocument("d1");
    expect(store.size()).toBe(0);
  });
  it("filters by documentId and minScore", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([
      { id: "v1", documentId: "d1", chunkId: "c1", text: "a", vector: [1, 0] },
      { id: "v2", documentId: "d2", chunkId: "c2", text: "b", vector: [0.99, 0.01] },
    ]);
    const filtered = await store.search([1, 0], { topK: 5, documentId: "d1" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.record.documentId).toBe("d1");

    const gated = await store.search([0, 1], { topK: 5, minScore: 0.9 });
    expect(gated).toHaveLength(0);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
});
