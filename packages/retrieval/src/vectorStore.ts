export interface VectorRecord {
  id: string;
  documentId: string;
  chunkId: string;
  text: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  record: VectorRecord;
  score: number;
}

export interface SearchOptions {
  topK?: number;
  documentId?: string;
  minScore?: number;
}

export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  search(queryVector: number[], topKOrOptions?: number | SearchOptions): Promise<SearchResult[]>;
  deleteByDocument(documentId: string): Promise<void>;
  size(): number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class InMemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, VectorRecord>();

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  async search(
    queryVector: number[],
    topKOrOptions: number | SearchOptions = 5,
  ): Promise<SearchResult[]> {
    const options: SearchOptions =
      typeof topKOrOptions === "number" ? { topK: topKOrOptions } : topKOrOptions;
    const topK = options.topK ?? 5;
    const scored: SearchResult[] = [];
    for (const record of this.records.values()) {
      if (options.documentId && record.documentId !== options.documentId) {
        continue;
      }
      const score = cosineSimilarity(queryVector, record.vector);
      if (options.minScore !== undefined && score < options.minScore) {
        continue;
      }
      scored.push({ record, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async deleteByDocument(documentId: string): Promise<void> {
    for (const [id, record] of this.records.entries()) {
      if (record.documentId === documentId) {
        this.records.delete(id);
      }
    }
  }

  size(): number {
    return this.records.size;
  }
}
