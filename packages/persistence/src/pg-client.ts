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

export async function runMigrations(pool: PgPool): Promise<string[]> {
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
      await client.query(sql);
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
