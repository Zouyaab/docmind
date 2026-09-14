#!/usr/bin/env node
/**
 * Start ephemeral Postgres/pgvector, run integration tests, tear down.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join("docker", "docker-compose.integration.yml");
const databaseUrl = "postgres://docmind:docmind@127.0.0.1:54329/docmind";

function run(command, args, env = process.env) {
  console.log(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  return result.status ?? 1;
}

function compose(args) {
  return run("docker", ["compose", "-f", composeFile, ...args]);
}

let exitCode = 0;
try {
  if (compose(["up", "-d", "--wait"]) !== 0) {
    throw new Error("Failed to start integration Postgres");
  }
  exitCode = run("pnpm", ["test:integration"], {
    ...process.env,
    DATABASE_URL: databaseUrl,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  compose(["down", "-v", "--remove-orphans"]);
}

process.exit(exitCode);
