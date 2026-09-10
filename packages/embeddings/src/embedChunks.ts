import type { EmbeddingProvider } from "@docmind/ai";
import type { Chunk } from "@docmind/core";

export interface EmbeddedChunk {
  chunkId: string;
  documentId: string;
  text: string;
  vector: number[];
}

export async function embedChunks(
  chunks: Chunk[],
  provider: EmbeddingProvider,
): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) {
    return [];
  }

  const texts = chunks.map((c) => c.text);
  const vectors = await provider.embed(texts);

  return chunks.map((chunk, index) => ({
    chunkId: chunk.id,
    documentId: chunk.documentId,
    text: chunk.text,
    vector: vectors[index] ?? [],
  }));
}
