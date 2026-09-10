import type { DocumentRecord, DocumentStatus } from "@docmind/core";
import { DocMindError, createId } from "@docmind/core";

export interface DocumentStore {
  save(document: DocumentRecord): Promise<DocumentRecord>;
  get(id: string): Promise<DocumentRecord | undefined>;
  list(): Promise<DocumentRecord[]>;
  delete(id: string): Promise<boolean>;
  findByHash(hash: string): Promise<DocumentRecord | undefined>;
  updateStatus(id: string, status: DocumentStatus): Promise<DocumentRecord | undefined>;
}

export function createDocumentRecord(input: {
  filename: string;
  mimeType: string;
  hash: string;
  size: number;
  id?: string;
  status?: DocumentStatus;
  pageCount?: number | null;
  metadata?: Record<string, unknown>;
}): DocumentRecord {
  const now = new Date().toISOString();
  return {
    id: input.id ?? createId("doc"),
    filename: input.filename,
    mimeType: input.mimeType,
    hash: input.hash,
    sizeBytes: input.size,
    createdAt: now,
    updatedAt: now,
    status: input.status ?? "uploaded",
    pageCount: input.pageCount ?? null,
    metadata: input.metadata ?? {},
  };
}

export class MemoryDocumentStore implements DocumentStore {
  private readonly documents = new Map<string, DocumentRecord>();
  private readonly hashIndex = new Map<string, string>();

  async save(document: DocumentRecord): Promise<DocumentRecord> {
    const existing = await this.findByHash(document.hash);
    if (existing && existing.id !== document.id) {
      throw new DocMindError("DUPLICATE", "Document with same hash already exists", {
        hash: document.hash,
        existingId: existing.id,
      });
    }

    this.documents.set(document.id, document);
    this.hashIndex.set(document.hash, document.id);
    return document;
  }

  async get(id: string): Promise<DocumentRecord | undefined> {
    return this.documents.get(id);
  }

  async list(): Promise<DocumentRecord[]> {
    return [...this.documents.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async delete(id: string): Promise<boolean> {
    const document = this.documents.get(id);
    if (!document) {
      return false;
    }
    this.documents.delete(id);
    this.hashIndex.delete(document.hash);
    return true;
  }

  async findByHash(hash: string): Promise<DocumentRecord | undefined> {
    const id = this.hashIndex.get(hash);
    return id ? this.documents.get(id) : undefined;
  }

  async updateStatus(id: string, status: DocumentStatus): Promise<DocumentRecord | undefined> {
    const existing = this.documents.get(id);
    if (!existing) return undefined;
    const updated: DocumentRecord = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.documents.set(id, updated);
    return updated;
  }
}
