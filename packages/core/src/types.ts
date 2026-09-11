export type DocumentStatus = "uploaded" | "queued" | "processing" | "completed" | "failed";
export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type ConfidenceBand = "HIGH_CONFIDENCE" | "REVIEW_REQUIRED" | "LOW_CONFIDENCE";

export interface DocumentRecord {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  createdAt: string;
  updatedAt: string;
  status: DocumentStatus;
  pageCount: number | null;
  metadata: Record<string, unknown>;
}

/** @deprecated Prefer DocumentRecord — alias for store APIs */
export type Document = DocumentRecord;

export interface Chunk {
  id: string;
  documentId: string;
  pageNumber?: number;
  text: string;
  startOffset?: number;
  endOffset?: number;
  metadata?: Record<string, unknown>;
}

export interface Evidence {
  documentId: string;
  chunkId?: string;
  page?: number;
  text: string;
}

export interface ExtractionFieldResult {
  field: string;
  value: unknown;
  confidence: number;
  band: ConfidenceBand;
  evidence: Evidence | null;
  validation: "ok" | "missing" | "type_mismatch" | "hallucinated";
}

export const DOCMIND_NAME = "DocMind";
export const DOCMIND_VERSION = "0.2.0";
