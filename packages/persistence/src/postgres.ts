import type { Chunk, DocumentRecord, DocumentStatus } from "@docmind/core";
import { DocMindError, createId } from "@docmind/core";
import type { DecisionResult } from "@docmind/decision-engine";
import type { DocumentStore } from "@docmind/ingestion";
import {
  cosineSimilarity,
  type SearchResult,
  type VectorRecord,
  type VectorStore,
} from "@docmind/retrieval";
import type { PgPool } from "./pg-client.js";
import { toVectorLiteral } from "./pg-client.js";
import type {
  ChunkStore,
  ClassificationRecord,
  ClassificationStore,
  DecisionStore,
  DocMindStores,
  FieldsStore,
} from "./types.js";

interface DocumentRow {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  hash: string;
  status: DocumentStatus;
  page_count: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    hash: row.hash,
    status: row.status,
    pageCount: row.page_count,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresDocumentStore implements DocumentStore {
  constructor(private readonly pool: PgPool) {}

  async save(document: DocumentRecord): Promise<DocumentRecord> {
    const existing = await this.findByHash(document.hash);
    if (existing && existing.id !== document.id) {
      throw new DocMindError("DUPLICATE", "Document with same hash already exists", {
        hash: document.hash,
        existingId: existing.id,
      });
    }
    await this.pool.query(
      `INSERT INTO documents
        (id, filename, mime_type, size_bytes, hash, status, page_count, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         filename = EXCLUDED.filename,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         hash = EXCLUDED.hash,
         status = EXCLUDED.status,
         page_count = EXCLUDED.page_count,
         metadata = EXCLUDED.metadata,
         updated_at = EXCLUDED.updated_at`,
      [
        document.id,
        document.filename,
        document.mimeType,
        document.sizeBytes,
        document.hash,
        document.status,
        document.pageCount,
        JSON.stringify(document.metadata ?? {}),
        document.createdAt,
        document.updatedAt,
      ],
    );
    return document;
  }

  async get(id: string): Promise<DocumentRecord | undefined> {
    const result = await this.pool.query<DocumentRow>("SELECT * FROM documents WHERE id = $1", [
      id,
    ]);
    return result.rows[0] ? mapDocument(result.rows[0]) : undefined;
  }

  async list(): Promise<DocumentRecord[]> {
    const result = await this.pool.query<DocumentRow>(
      "SELECT * FROM documents ORDER BY created_at ASC",
    );
    return result.rows.map(mapDocument);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM documents WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async findByHash(hash: string): Promise<DocumentRecord | undefined> {
    const result = await this.pool.query<DocumentRow>("SELECT * FROM documents WHERE hash = $1", [
      hash,
    ]);
    return result.rows[0] ? mapDocument(result.rows[0]) : undefined;
  }

  async updateStatus(id: string, status: DocumentStatus): Promise<DocumentRecord | undefined> {
    const result = await this.pool.query<DocumentRow>(
      `UPDATE documents SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
      [id, status, new Date().toISOString()],
    );
    return result.rows[0] ? mapDocument(result.rows[0]) : undefined;
  }
}

export class PostgresChunkStore implements ChunkStore {
  constructor(private readonly pool: PgPool) {}

  async replaceForDocument(documentId: string, chunks: Chunk[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM chunks WHERE document_id = $1", [documentId]);
      for (const chunk of chunks) {
        await client.query(
          `INSERT INTO chunks
            (id, document_id, page_number, section, text, start_offset, end_offset, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            chunk.id,
            documentId,
            chunk.pageNumber ?? null,
            typeof chunk.metadata?.section === "string" ? chunk.metadata.section : null,
            chunk.text,
            chunk.startOffset ?? null,
            chunk.endOffset ?? null,
            JSON.stringify(chunk.metadata ?? {}),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listByDocument(documentId: string): Promise<Chunk[]> {
    const result = await this.pool.query<{
      id: string;
      document_id: string;
      page_number: number | null;
      section: string | null;
      text: string;
      start_offset: number | null;
      end_offset: number | null;
      metadata: Record<string, unknown>;
    }>("SELECT * FROM chunks WHERE document_id = $1 ORDER BY start_offset NULLS LAST, id", [
      documentId,
    ]);
    return result.rows.map((row) => {
      const chunk: Chunk = {
        id: row.id,
        documentId: row.document_id,
        text: row.text,
        metadata: {
          ...(row.metadata ?? {}),
          ...(row.section ? { section: row.section } : {}),
        },
      };
      if (row.page_number !== null) chunk.pageNumber = row.page_number;
      if (row.start_offset !== null) chunk.startOffset = row.start_offset;
      if (row.end_offset !== null) chunk.endOffset = row.end_offset;
      return chunk;
    });
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.pool.query("DELETE FROM chunks WHERE document_id = $1", [documentId]);
  }
}

export class PostgresClassificationStore implements ClassificationStore {
  constructor(private readonly pool: PgPool) {}

  async save(record: ClassificationRecord): Promise<ClassificationRecord> {
    const updatedAt = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO classifications
        (document_id, document_type, confidence, band, evidence, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6)
       ON CONFLICT (document_id) DO UPDATE SET
         document_type = EXCLUDED.document_type,
         confidence = EXCLUDED.confidence,
         band = EXCLUDED.band,
         evidence = EXCLUDED.evidence,
         updated_at = EXCLUDED.updated_at`,
      [
        record.documentId,
        record.documentType,
        record.confidence,
        record.band,
        JSON.stringify(record.evidence),
        updatedAt,
      ],
    );
    return { ...record, updatedAt };
  }

  async get(documentId: string): Promise<ClassificationRecord | undefined> {
    const result = await this.pool.query<{
      document_id: string;
      document_type: string;
      confidence: number;
      band: ClassificationRecord["band"];
      evidence: unknown[];
      updated_at: Date;
    }>("SELECT * FROM classifications WHERE document_id = $1", [documentId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      documentId: row.document_id,
      documentType: row.document_type,
      confidence: row.confidence,
      band: row.band,
      evidence: row.evidence ?? [],
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresFieldsStore implements FieldsStore {
  constructor(private readonly pool: PgPool) {}

  async save(documentId: string, fields: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `INSERT INTO extracted_fields (document_id, fields, updated_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (document_id) DO UPDATE SET fields = EXCLUDED.fields, updated_at = EXCLUDED.updated_at`,
      [documentId, JSON.stringify(fields), new Date().toISOString()],
    );
  }

  async get(documentId: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query<{ fields: Record<string, unknown> }>(
      "SELECT fields FROM extracted_fields WHERE document_id = $1",
      [documentId],
    );
    return result.rows[0]?.fields;
  }
}

export class PostgresDecisionStore implements DecisionStore {
  constructor(private readonly pool: PgPool) {}

  async save(documentId: string, result: DecisionResult): Promise<string> {
    const id = createId("dec");
    await this.pool.query(
      `INSERT INTO decisions (id, document_id, decision, risk_score, result)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [id, documentId, result.decision, result.riskScore, JSON.stringify(result)],
    );
    return id;
  }

  async latest(documentId: string): Promise<DecisionResult | undefined> {
    const result = await this.pool.query<{ result: DecisionResult }>(
      `SELECT result FROM decisions WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [documentId],
    );
    return result.rows[0]?.result;
  }
}

/**
 * Persists embeddings in pgvector. Search uses cosine distance (`<=>`) when
 * the extension is available; falls back to in-process scoring on failure.
 */
export class PostgresVectorStore implements VectorStore {
  private fallbackCount = 0;

  constructor(
    private readonly pool: PgPool,
    private readonly dimensions = 32,
  ) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      if (record.vector.length !== this.dimensions) {
        throw new DocMindError(
          "VALIDATION_ERROR",
          `Embedding dimension mismatch: expected ${this.dimensions}, got ${record.vector.length}`,
          400,
        );
      }
      await this.pool.query(
        `INSERT INTO embeddings (id, document_id, chunk_id, text, embedding, metadata)
         VALUES ($1,$2,$3,$4,$5::vector,$6::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           document_id = EXCLUDED.document_id,
           chunk_id = EXCLUDED.chunk_id,
           text = EXCLUDED.text,
           embedding = EXCLUDED.embedding,
           metadata = EXCLUDED.metadata`,
        [
          record.id,
          record.documentId,
          record.chunkId,
          record.text,
          toVectorLiteral(record.vector),
          JSON.stringify(record.metadata ?? {}),
        ],
      );
    }
  }

  async search(
    queryVector: number[],
    topKOrOptions: number | import("@docmind/retrieval").SearchOptions = 5,
  ): Promise<SearchResult[]> {
    const options =
      typeof topKOrOptions === "number"
        ? { topK: topKOrOptions }
        : { topK: topKOrOptions.topK ?? 5, ...topKOrOptions };
    const topK = options.topK ?? 5;
    if (queryVector.length !== this.dimensions) {
      throw new DocMindError(
        "VALIDATION_ERROR",
        `Query embedding dimension mismatch: expected ${this.dimensions}`,
        400,
      );
    }

    try {
      const params: unknown[] = [toVectorLiteral(queryVector), topK];
      let sql = `
        SELECT id, document_id, chunk_id, text, embedding::text AS embedding_text, metadata,
               1 - (embedding <=> $1::vector) AS score
        FROM embeddings`;
      if (options.documentId) {
        params.push(options.documentId);
        sql += ` WHERE document_id = $3`;
      }
      sql += ` ORDER BY embedding <=> $1::vector ASC LIMIT $2`;
      const result = await this.pool.query<{
        id: string;
        document_id: string;
        chunk_id: string;
        text: string;
        embedding_text: string;
        metadata: Record<string, unknown>;
        score: number;
      }>(sql, params);

      return result.rows
        .map((row) => ({
          record: {
            id: row.id,
            documentId: row.document_id,
            chunkId: row.chunk_id,
            text: row.text,
            vector: parseVectorText(row.embedding_text),
            metadata: row.metadata ?? {},
          },
          score: Number(row.score),
        }))
        .filter((hit) => (options.minScore === undefined ? true : hit.score >= options.minScore));
    } catch (error) {
      try {
        this.fallbackCount += 1;
        return await this.searchInProcess(queryVector, topK, options);
      } catch {
        throw new DocMindError(
          "DATABASE_ERROR",
          error instanceof Error ? error.message : "PostgreSQL vector search failed",
          503,
        );
      }
    }
  }

  private async searchInProcess(
    queryVector: number[],
    topK: number,
    options: { documentId?: string; minScore?: number },
  ): Promise<SearchResult[]> {
    const result = await this.pool.query<{
      id: string;
      document_id: string;
      chunk_id: string;
      text: string;
      embedding_text: string;
      metadata: Record<string, unknown>;
    }>(
      options.documentId
        ? `SELECT id, document_id, chunk_id, text, embedding::text AS embedding_text, metadata
           FROM embeddings WHERE document_id = $1`
        : `SELECT id, document_id, chunk_id, text, embedding::text AS embedding_text, metadata FROM embeddings`,
      options.documentId ? [options.documentId] : [],
    );
    const scored = result.rows
      .map((row) => {
        const vector = parseVectorText(row.embedding_text);
        return {
          record: {
            id: row.id,
            documentId: row.document_id,
            chunkId: row.chunk_id,
            text: row.text,
            vector,
            metadata: row.metadata ?? {},
          },
          score: cosineSimilarity(queryVector, vector),
        };
      })
      .filter((hit) => (options.minScore === undefined ? true : hit.score >= options.minScore))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored;
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.pool.query("DELETE FROM embeddings WHERE document_id = $1", [documentId]);
  }

  size(): number {
    return this.fallbackCount;
  }

  async count(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM embeddings",
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

function parseVectorText(raw: string): number[] {
  const trimmed = raw.replace(/^\[/, "").replace(/\]$/, "");
  if (!trimmed) return [];
  return trimmed.split(",").map((part) => Number(part.trim()));
}

export function createPostgresStores(pool: PgPool, dimensions = 32): DocMindStores {
  return {
    documents: new PostgresDocumentStore(pool),
    chunks: new PostgresChunkStore(pool),
    vectors: new PostgresVectorStore(pool, dimensions),
    classifications: new PostgresClassificationStore(pool),
    fields: new PostgresFieldsStore(pool),
    decisions: new PostgresDecisionStore(pool),
  };
}
