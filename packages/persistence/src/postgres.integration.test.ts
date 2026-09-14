/**
 * Opt-in Postgres integration tests.
 *
 * Preferred local/CI runner (ephemeral Docker Postgres on port 54329):
 *   pnpm test:integration:docker
 *
 * Manual:
 *   DATABASE_URL=postgres://docmind:docmind@127.0.0.1:54329/docmind pnpm test:integration
 *
 * Excluded from the default offline suite (`pnpm test`) via vitest.config.ts.
 * When DATABASE_URL is unset the suite is explicitly skipped (not silently empty).
 * When DATABASE_URL is set but PostgreSQL is unreachable, the suite fails.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocumentRecord } from "@docmind/ingestion";
import {
  checkPostgresHealth,
  createPgPool,
  ensureEmbeddingDimensions,
  getEmbeddingVectorDimensions,
  runMigrations,
  type PgPool,
} from "./pg-client.js";
import { createPostgresStores } from "./postgres.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

const FIXTURE_TEXT = "Termination notice is fourteen days. Auto-renewal: true.";

describe("postgres persistence", () => {
  if (!databaseUrl) {
    it.skip("skipped — set DATABASE_URL to run PostgreSQL integration tests", () => {
      // Documented skip: offline CI and fresh clones must not require Postgres.
    });
    return;
  }

  let pool: PgPool;

  beforeAll(async () => {
    pool = createPgPool(databaseUrl);
    const ok = await checkPostgresHealth(pool);
    if (!ok) {
      throw new Error("DATABASE_URL set but PostgreSQL is unreachable");
    }
    await runMigrations(pool, { embeddingDimensions: 32 });
    await ensureEmbeddingDimensions(pool, 32);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies schema migrations idempotently", async () => {
    const first = await runMigrations(pool, { embeddingDimensions: 32 });
    const second = await runMigrations(pool, { embeddingDimensions: 32 });
    expect(Array.isArray(first)).toBe(true);
    expect(second).toEqual([]);
    const ext = await pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    expect(ext.rowCount).toBeGreaterThan(0);
    expect(await getEmbeddingVectorDimensions(pool)).toBe(32);
  });

  it("round-trips a document and vector search", async () => {
    const stores = createPostgresStores(pool, 32);
    const doc = createDocumentRecord({
      filename: "pg-fixture.txt",
      mimeType: "text/plain",
      hash: `hash-doc-${Date.now()}`,
      size: FIXTURE_TEXT.length,
    });
    await stores.documents.save(doc);
    const loaded = await stores.documents.get(doc.id);
    expect(loaded?.filename).toBe("pg-fixture.txt");

    await stores.chunks.replaceForDocument(doc.id, [
      {
        id: `chunk_${doc.id}`,
        documentId: doc.id,
        text: FIXTURE_TEXT,
        metadata: { page: 1 },
      },
    ]);
    const vector = Array.from({ length: 32 }, (_, i) => (i === 0 ? 1 : 0));
    await stores.vectors.upsert([
      {
        id: `vec_${doc.id}`,
        documentId: doc.id,
        chunkId: `chunk_${doc.id}`,
        text: FIXTURE_TEXT,
        vector,
        metadata: { page: 1 },
      },
    ]);
    const hits = await stores.vectors.search(vector, 3);
    expect(hits.some((h) => h.record.documentId === doc.id)).toBe(true);
    await stores.documents.delete(doc.id);
  });

  it("ranks nearer embeddings ahead of farther ones", async () => {
    const stores = createPostgresStores(pool, 32);
    const doc = createDocumentRecord({
      filename: "pg-rank.txt",
      mimeType: "text/plain",
      hash: `hash-rank-${Date.now()}`,
      size: 8,
    });
    await stores.documents.save(doc);
    await stores.chunks.replaceForDocument(doc.id, [
      { id: `chunk_near_${doc.id}`, documentId: doc.id, text: "near" },
      { id: `chunk_far_${doc.id}`, documentId: doc.id, text: "far" },
    ]);

    const near = Array.from({ length: 32 }, (_, i) => (i === 0 ? 1 : 0));
    const far = Array.from({ length: 32 }, (_, i) => (i === 1 ? 1 : 0));
    const query = Array.from({ length: 32 }, (_, i) => (i === 0 ? 0.9 : i === 1 ? 0.1 : 0));

    await stores.vectors.upsert([
      {
        id: `vec_near_${doc.id}`,
        documentId: doc.id,
        chunkId: `chunk_near_${doc.id}`,
        text: "near",
        vector: near,
      },
      {
        id: `vec_far_${doc.id}`,
        documentId: doc.id,
        chunkId: `chunk_far_${doc.id}`,
        text: "far",
        vector: far,
      },
    ]);

    const hits = await stores.vectors.search(query, { topK: 2, documentId: doc.id });
    expect(hits).toHaveLength(2);
    expect(hits[0]?.record.chunkId).toBe(`chunk_near_${doc.id}`);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    await stores.documents.delete(doc.id);
  });

  it("retrieval survives a new connection pool (process boundary)", async () => {
    const stores = createPostgresStores(pool, 32);
    const doc = createDocumentRecord({
      filename: "pg-boundary.txt",
      mimeType: "text/plain",
      hash: `hash-boundary-${Date.now()}`,
      size: FIXTURE_TEXT.length,
    });
    await stores.documents.save(doc);
    await stores.chunks.replaceForDocument(doc.id, [
      { id: `chunk_${doc.id}`, documentId: doc.id, text: FIXTURE_TEXT },
    ]);
    const vector = Array.from({ length: 32 }, (_, i) => (i === 2 ? 1 : 0));
    await stores.vectors.upsert([
      {
        id: `vec_${doc.id}`,
        documentId: doc.id,
        chunkId: `chunk_${doc.id}`,
        text: FIXTURE_TEXT,
        vector,
      },
    ]);

    const freshPool = createPgPool(databaseUrl);
    try {
      const freshStores = createPostgresStores(freshPool, 32);
      const loaded = await freshStores.documents.get(doc.id);
      expect(loaded?.id).toBe(doc.id);
      const hits = await freshStores.vectors.search(vector, { topK: 3, documentId: doc.id });
      expect(hits[0]?.record.documentId).toBe(doc.id);
    } finally {
      await freshPool.end();
    }

    await stores.documents.delete(doc.id);
  });

  it("resizes empty embedding column when EMBEDDING_DIMENSIONS changes", async () => {
    await pool.query("TRUNCATE embeddings");
    const resized = await ensureEmbeddingDimensions(pool, 64);
    expect(resized).toBe("resized");
    expect(await getEmbeddingVectorDimensions(pool)).toBe(64);

    const stores = createPostgresStores(pool, 64);
    const doc = createDocumentRecord({
      filename: "pg-dims.txt",
      mimeType: "text/plain",
      hash: `hash-dims-${Date.now()}`,
      size: 4,
    });
    await stores.documents.save(doc);
    await stores.chunks.replaceForDocument(doc.id, [
      { id: `chunk_${doc.id}`, documentId: doc.id, text: "dims" },
    ]);
    const vector = Array.from({ length: 64 }, (_, i) => (i === 0 ? 1 : 0));
    await stores.vectors.upsert([
      {
        id: `vec_${doc.id}`,
        documentId: doc.id,
        chunkId: `chunk_${doc.id}`,
        text: "dims",
        vector,
      },
    ]);
    const hits = await stores.vectors.search(vector, 1);
    expect(hits[0]?.record.documentId).toBe(doc.id);
    await stores.documents.delete(doc.id);

    await pool.query("TRUNCATE embeddings");
    await ensureEmbeddingDimensions(pool, 32);
    expect(await getEmbeddingVectorDimensions(pool)).toBe(32);
  });

  it("persists classification, fields, and decisions for a fixture document", async () => {
    const stores = createPostgresStores(pool, 32);
    const doc = createDocumentRecord({
      filename: "pg-decision.txt",
      mimeType: "text/plain",
      hash: `hash-decision-${Date.now()}`,
      size: FIXTURE_TEXT.length,
    });
    await stores.documents.save(doc);

    await stores.classifications.save({
      documentId: doc.id,
      documentType: "contract",
      confidence: 0.91,
      band: "HIGH_CONFIDENCE",
      evidence: [{ documentId: doc.id, chunkId: `chunk_${doc.id}`, text: "Auto-renewal" }],
      updatedAt: new Date().toISOString(),
    });
    await stores.fields.save(doc.id, {
      notice_period_days: 14,
      auto_renewal: true,
    });
    const decisionId = await stores.decisions.save(doc.id, {
      decision: "REVIEW_REQUIRED",
      riskScore: 0.72,
      risks: [
        {
          rule: "SHORT_TERMINATION_NOTICE",
          title: "Short termination notice",
          severity: "MEDIUM",
          explanation: "Notice period under 30 days",
          points: 25,
          evidence: [{ documentId: doc.id, chunkId: `chunk_${doc.id}`, text: "fourteen days" }],
        },
      ],
      rulesEvaluated: 1,
      note: "Short notice requires review",
    });

    const classification = await stores.classifications.get(doc.id);
    expect(classification?.documentType).toBe("contract");
    const fields = await stores.fields.get(doc.id);
    expect(fields).toMatchObject({ notice_period_days: 14, auto_renewal: true });
    const decision = await stores.decisions.latest(doc.id);
    expect(decision?.decision).toBe("REVIEW_REQUIRED");
    expect(decisionId).toBeTruthy();

    await stores.documents.delete(doc.id);
  });
});
