import { createId, type Chunk, type ConfidenceBand } from "@docmind/core";
import type { DecisionResult } from "@docmind/decision-engine";
import { MemoryDocumentStore } from "@docmind/ingestion";
import { InMemoryVectorStore } from "@docmind/retrieval";
import type {
  ChunkStore,
  ClassificationRecord,
  ClassificationStore,
  DecisionStore,
  DocMindStores,
  FieldsStore,
} from "./types.js";

export class MemoryChunkStore implements ChunkStore {
  private readonly byDocument = new Map<string, Chunk[]>();

  async replaceForDocument(documentId: string, chunks: Chunk[]): Promise<void> {
    this.byDocument.set(
      documentId,
      chunks.map((chunk) => ({ ...chunk, metadata: chunk.metadata ?? {} })),
    );
  }

  async listByDocument(documentId: string): Promise<Chunk[]> {
    return [...(this.byDocument.get(documentId) ?? [])];
  }

  async deleteByDocument(documentId: string): Promise<void> {
    this.byDocument.delete(documentId);
  }
}

export class MemoryClassificationStore implements ClassificationStore {
  private readonly byId = new Map<string, ClassificationRecord>();

  async save(record: ClassificationRecord): Promise<ClassificationRecord> {
    const saved = { ...record, updatedAt: new Date().toISOString() };
    this.byId.set(record.documentId, saved);
    return saved;
  }

  async get(documentId: string): Promise<ClassificationRecord | undefined> {
    return this.byId.get(documentId);
  }
}

export class MemoryFieldsStore implements FieldsStore {
  private readonly byId = new Map<string, Record<string, unknown>>();

  async save(documentId: string, fields: Record<string, unknown>): Promise<void> {
    this.byId.set(documentId, { ...fields });
  }

  async get(documentId: string): Promise<Record<string, unknown> | undefined> {
    const value = this.byId.get(documentId);
    return value ? { ...value } : undefined;
  }
}

export class MemoryDecisionStore implements DecisionStore {
  private readonly byDocument = new Map<string, DecisionResult[]>();

  async save(documentId: string, result: DecisionResult): Promise<string> {
    const id = createId("dec");
    const list = this.byDocument.get(documentId) ?? [];
    list.push(result);
    this.byDocument.set(documentId, list);
    return id;
  }

  async latest(documentId: string): Promise<DecisionResult | undefined> {
    const list = this.byDocument.get(documentId) ?? [];
    return list[list.length - 1];
  }
}

export function createMemoryStores(): DocMindStores {
  return {
    documents: new MemoryDocumentStore(),
    chunks: new MemoryChunkStore(),
    vectors: new InMemoryVectorStore(),
    classifications: new MemoryClassificationStore(),
    fields: new MemoryFieldsStore(),
    decisions: new MemoryDecisionStore(),
  };
}

export type { ConfidenceBand };
