/**
 * Opt-in Postgres integration tests.
 * Run with: DATABASE_URL=postgres://... pnpm vitest run packages/persistence/src/postgres.integration.test.ts
 *
 * Excluded from default CI via vitest exclude pattern *.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocumentRecord } from "@docmind/ingestion";
import { checkPostgresHealth, createPgPool, runMigrations, type PgPool } from "./pg-client.js";
import { createPostgresStores } from "./postgres.js";

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))("postgres persistence", () => {
  let pool: PgPool;

  beforeAll(async () => {
    pool = createPgPool(databaseUrl!);
    const ok = await checkPostgresHealth(pool);
    if (!ok) {
      throw new Error("DATABASE_URL set but PostgreSQL is unreachable");
    }
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("round-trips a document and vector search", async () => {
    const stores = createPostgresStores(pool, 32);
    const doc = createDocumentRecord({
      filename: "pg.txt",
      mimeType: "text/plain",
      hash: `hash-${Date.now()}`,
      size: 12,
    });
    await stores.documents.save(doc);
    await stores.chunks.replaceForDocument(doc.id, [
      {
        id: `chunk_${doc.id}`,
        documentId: doc.id,
        text: "Termination notice is fourteen days",
        metadata: {},
      },
    ]);
    const vector = Array.from({ length: 32 }, (_, i) => (i === 0 ? 1 : 0));
    await stores.vectors.upsert([
      {
        id: `vec_${doc.id}`,
        documentId: doc.id,
        chunkId: `chunk_${doc.id}`,
        text: "Termination notice is fourteen days",
        vector,
        metadata: {},
      },
    ]);
    const hits = await stores.vectors.search(vector, 3);
    expect(hits.some((h) => h.record.documentId === doc.id)).toBe(true);
    await stores.documents.delete(doc.id);
  });
});
