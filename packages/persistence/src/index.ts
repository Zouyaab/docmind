import { DocMindError } from "@docmind/core";
import { createMemoryStores } from "./memory.js";
import { checkPostgresHealth, createPgPool, runMigrations, type PgPool } from "./pg-client.js";
import { createPostgresStores } from "./postgres.js";
import type { DocMindStores, PersistenceMode } from "./types.js";

export type {
  ChunkStore,
  ClassificationRecord,
  ClassificationStore,
  DecisionStore,
  DocMindStores,
  FieldsStore,
  PersistenceMode,
} from "./types.js";

export {
  MemoryChunkStore,
  MemoryClassificationStore,
  MemoryDecisionStore,
  MemoryFieldsStore,
  createMemoryStores,
} from "./memory.js";

export {
  PostgresChunkStore,
  PostgresClassificationStore,
  PostgresDecisionStore,
  PostgresDocumentStore,
  PostgresFieldsStore,
  PostgresVectorStore,
  createPostgresStores,
} from "./postgres.js";

export { checkPostgresHealth, createPgPool, runMigrations, type PgPool } from "./pg-client.js";

export interface CreateStoresOptions {
  databaseUrl?: string;
  embeddingDimensions?: number;
}

export interface CreateStoresResult {
  mode: PersistenceMode;
  stores: DocMindStores;
  pool?: PgPool;
}

/**
 * Memory stores when DATABASE_URL is unset (tests/CI/offline).
 * PostgreSQL + pgvector when DATABASE_URL is provided.
 */
export async function createStores(options: CreateStoresOptions = {}): Promise<CreateStoresResult> {
  const databaseUrl = options.databaseUrl?.trim();
  if (!databaseUrl) {
    return { mode: "memory", stores: createMemoryStores() };
  }

  const pool = createPgPool(databaseUrl);
  const healthy = await checkPostgresHealth(pool);
  if (!healthy) {
    await pool.end().catch(() => undefined);
    throw new DocMindError(
      "DATABASE_UNAVAILABLE",
      "Unable to connect to PostgreSQL using DATABASE_URL",
      503,
    );
  }

  await runMigrations(pool);
  return {
    mode: "postgres",
    stores: createPostgresStores(pool, options.embeddingDimensions ?? 32),
    pool,
  };
}
