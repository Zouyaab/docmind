import { describe, expect, it } from "vitest";
import { createMockProviders } from "@docmind/ai";
import type { Chunk } from "@docmind/core";
import { embedChunks } from "./embedChunks.js";

describe("embedChunks", () => {
  it("attaches vectors to chunk ids", async () => {
    const { embedding } = createMockProviders();
    const chunks: Chunk[] = [
      {
        id: "c1",
        documentId: "d1",
        text: "hello",
        metadata: {},
      },
      {
        id: "c2",
        documentId: "d1",
        text: "world",
        metadata: {},
      },
    ];
    const result = await embedChunks(chunks, embedding);
    expect(result).toHaveLength(2);
    expect(result[0]!.chunkId).toBe("c1");
    expect(result[0]!.vector.length).toBeGreaterThan(0);
  });
});
