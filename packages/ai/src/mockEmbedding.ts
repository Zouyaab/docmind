import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./types.js";

const DEFAULT_DIM = 64;

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock-embedding";
  readonly dimensions: number;

  constructor(dimensions = DEFAULT_DIM) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => hashToVector(text, this.dimensions));
  }
}

export function hashToVector(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const hash = createHash("sha256").update(text).digest();

  for (let i = 0; i < dimensions; i += 1) {
    const byte = hash[i % hash.length]!;
    vector[i] = (byte / 255) * 2 - 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}
