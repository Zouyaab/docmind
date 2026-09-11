import type { Chunk, ConfidenceBand, DocumentRecord } from "@docmind/core";
import type { DocumentStore } from "@docmind/ingestion";
import type { VectorStore } from "@docmind/retrieval";
import type { DecisionResult } from "@docmind/decision-engine";

export interface ClassificationRecord {
  documentId: string;
  documentType: string;
  confidence: number;
  band: ConfidenceBand;
  evidence: unknown[];
  updatedAt: string;
}

export interface ChunkStore {
  replaceForDocument(documentId: string, chunks: Chunk[]): Promise<void>;
  listByDocument(documentId: string): Promise<Chunk[]>;
  deleteByDocument(documentId: string): Promise<void>;
}

export interface ClassificationStore {
  save(record: ClassificationRecord): Promise<ClassificationRecord>;
  get(documentId: string): Promise<ClassificationRecord | undefined>;
}

export interface FieldsStore {
  save(documentId: string, fields: Record<string, unknown>): Promise<void>;
  get(documentId: string): Promise<Record<string, unknown> | undefined>;
}

export interface DecisionStore {
  save(documentId: string, result: DecisionResult): Promise<string>;
  latest(documentId: string): Promise<DecisionResult | undefined>;
}

export interface DocMindStores {
  documents: DocumentStore;
  chunks: ChunkStore;
  vectors: VectorStore;
  classifications: ClassificationStore;
  fields: FieldsStore;
  decisions: DecisionStore;
}

export type PersistenceMode = "memory" | "postgres";

export function toDocumentRow(doc: DocumentRecord): DocumentRecord {
  return { ...doc, metadata: doc.metadata ?? {} };
}
