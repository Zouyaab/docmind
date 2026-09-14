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
import { checkPostgresHealth, createPgPool, runMigrations, type PgPool } from "./pg-client.js";
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
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies schema migrations idempotently", async () => {
    const first = await runMigrations(pool);
    const second = await runMigrations(pool);
    expect(Array.isArray(first)).toBe(true);
    expect(second).toEqual([]);
    const ext = await pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    expect(ext.rowCount).toBeGreaterThan(0);
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
