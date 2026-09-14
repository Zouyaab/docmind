import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DocMindError } from "@docmind/core";

const { Pool } = pg;

export type PgPool = pg.Pool;
export type PgClient = pg.PoolClient;

export function createPgPool(databaseUrl: string): PgPool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export async function checkPostgresHealth(pool: PgPool): Promise<boolean> {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

/** Replace fixed `vector(N)` literals so schema matches configured embedding size. */
export function renderMigrationSql(sql: string, embeddingDimensions: number): string {
  if (
    !Number.isInteger(embeddingDimensions) ||
    embeddingDimensions < 1 ||
    embeddingDimensions > 16_384
  ) {
    throw new DocMindError(
      "VALIDATION_ERROR",
      `Invalid EMBEDDING_DIMENSIONS: ${embeddingDimensions}`,
      400,
    );
  }
  return sql.replace(/vector\(\d+\)/gi, `vector(${embeddingDimensions})`);
}

export async function getEmbeddingVectorDimensions(pool: PgPool): Promise<number | null> {
  const result = await pool.query<{ typ: string }>(
    `SELECT format_type(a.atttypid, a.atttypmod) AS typ
     FROM pg_attribute a
     JOIN pg_class c ON a.attrelid = c.oid
     JOIN pg_namespace n ON c.relnamespace = n.oid
     WHERE n.nspname = 'public'
       AND c.relname = 'embeddings'
       AND a.attname = 'embedding'
       AND a.attnum > 0
       AND NOT a.attisdropped
     LIMIT 1`,
  );
  const typ = result.rows[0]?.typ;
  if (!typ) return null;
  const match = typ.match(/vector\((\d+)\)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Ensure embeddings.embedding matches the configured dimension.
 * Empty tables may be resized; non-empty mismatches fail loudly.
 */
export async function ensureEmbeddingDimensions(
  pool: PgPool,
  embeddingDimensions: number,
): Promise<"ok" | "resized"> {
  if (!Number.isInteger(embeddingDimensions) || embeddingDimensions < 1) {
    throw new DocMindError(
      "VALIDATION_ERROR",
      `Invalid EMBEDDING_DIMENSIONS: ${embeddingDimensions}`,
      400,
    );
  }

  const current = await getEmbeddingVectorDimensions(pool);
  if (current === null) {
    return "ok";
  }
  if (current === embeddingDimensions) {
    return "ok";
  }

  const countResult = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM embeddings",
  );
  const count = Number(countResult.rows[0]?.count ?? 0);
  if (count > 0) {
    throw new DocMindError(
      "EMBEDDING_DIMENSION_MISMATCH",
      `Database embeddings use vector(${current}) but EMBEDDING_DIMENSIONS=${embeddingDimensions}. ` +
        "Clear the embeddings table (or recreate the database) before changing dimensions.",
      500,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE embeddings DROP COLUMN embedding");
    await client.query(
      `ALTER TABLE embeddings ADD COLUMN embedding vector(${embeddingDimensions}) NOT NULL`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new DocMindError(
      "MIGRATION_ERROR",
      error instanceof Error ? error.message : "Failed to resize embedding column",
      500,
    );
  } finally {
    client.release();
  }
  return "resized";
}

export async function runMigrations(
  pool: PgPool,
  options: { embeddingDimensions?: number } = {},
): Promise<string[]> {
  const embeddingDimensions = options.embeddingDimensions ?? 32;
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const sqlPath = join(dir, "001_init.sql");
  let sql: string;
  try {
    sql = await readFile(sqlPath, "utf8");
  } catch (error) {
    throw new DocMindError("MIGRATION_ERROR", "Unable to read migration file", {
      path: sqlPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1",
      ["001_init"],
    );
    if (existing.rowCount === 0) {
      await client.query(renderMigrationSql(sql, embeddingDimensions));
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", ["001_init"]);
      applied.push("001_init");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new DocMindError(
      "MIGRATION_ERROR",
      error instanceof Error ? error.message : "Migration failed",
      500,
    );
  } finally {
    client.release();
  }
  return applied;
}

export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
