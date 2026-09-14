#!/usr/bin/env node
/**
 * Offline bootstrap for a fresh clone.
 * Validates Node/pnpm, installs with a frozen lockfile, builds, and runs the
 * default offline test suite — no cloud accounts, API keys, Ollama, or Postgres.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function fail(message) {
  console.error(`bootstrap: ${message}`);
  process.exit(1);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      // Keep bootstrap offline: never inherit a developer DATABASE_URL into tests.
      DATABASE_URL: "",
      AI_PROVIDER: "mock",
    },
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit ${result.status ?? "unknown"}`);
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  fail(`Node.js >= 20 required (found ${process.versions.node})`);
}

const engines = pkg.packageManager ?? "";
console.log(`DocMind bootstrap (${pkg.version})`);
console.log(`Node ${process.versions.node}; packageManager ${engines || "unspecified"}`);
console.log("Mode: offline (mock AI, in-memory persistence)");

run("pnpm", ["install", "--frozen-lockfile"]);
run("pnpm", ["build"]);
run("pnpm", ["test"]);

console.log("\nbootstrap: ok — offline install, build, and tests passed.");
console.log("Next: pnpm dev   # API on http://127.0.0.1:3000");
