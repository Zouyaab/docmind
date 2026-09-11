#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { DOCMIND_VERSION, DocMindError } from "@docmind/core";
import { DocMindClient } from "@docmind/sdk";

export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  readFile?: (path: string) => Promise<Uint8Array>;
}

function usage(): string {
  return `DocMind CLI v${DOCMIND_VERSION}

Usage:
  docmind --version
  docmind health [--url URL]
  docmind ready [--url URL]
  docmind ingest <file> [--url URL]
  docmind ask <question> [--url URL]
  docmind decide <documentId> [--url URL]

Exit codes:
  0  success
  1  usage / client error
  2  timeout
  3  network / unexpected failure
`;
}

function getFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : undefined;
}

function getBaseUrl(argv: string[]): string {
  return getFlag(argv, "--url") ?? "http://127.0.0.1:3000";
}

function mapErrorToExitCode(error: unknown): number {
  if (DocMindError.isDocMindError(error)) {
    if (error.code === "TIMEOUT") return 2;
    if (error.code === "NETWORK_ERROR") return 3;
    return 1;
  }
  return 3;
}

/** Testable CLI entrypoint. Returns process exit code. */
export async function runCli(
  argv: string[],
  io: CliIo = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
    env: process.env,
  },
): Promise<number> {
  const [, , command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    io.stdout(usage());
    return 0;
  }

  if (command === "--version" || command === "version") {
    io.stdout(DOCMIND_VERSION);
    return 0;
  }

  const token = io.env.API_TOKEN;
  const timeoutRaw = io.env.DOCMIND_TIMEOUT_MS;
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 60_000;
  const clientOptions: ConstructorParameters<typeof DocMindClient>[0] = {
    baseUrl: getBaseUrl(argv),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
  };
  if (token) {
    clientOptions.token = token;
  }
  if (io.fetchImpl) {
    clientOptions.fetchImpl = io.fetchImpl;
  }
  const client = new DocMindClient(clientOptions);
  const readBytes = io.readFile ?? (async (path: string) => new Uint8Array(await readFile(path)));

  try {
    switch (command) {
      case "health": {
        const result = await client.health();
        io.stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      case "ready": {
        const result = await client.ready();
        io.stdout(JSON.stringify(result, null, 2));
        return result.ready ? 0 : 1;
      }
      case "ingest": {
        const file = rest.find((a) => !a.startsWith("--"));
        if (!file) {
          io.stderr("Missing file path");
          return 1;
        }
        const bytes = await readBytes(file);
        const filename = file.split(/[/\\]/).pop() ?? "upload.txt";
        const uploaded = await client.upload(filename, bytes);
        const processed = await client.processDocument(uploaded.document.id);
        io.stdout(JSON.stringify({ ...uploaded, processed }, null, 2));
        return 0;
      }
      case "ask": {
        const question = rest.filter((a) => !a.startsWith("--")).join(" ");
        if (!question) {
          io.stderr("Missing question");
          return 1;
        }
        const result = await client.ask(question);
        io.stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      case "decide": {
        const docId = rest.find((a) => !a.startsWith("--"));
        if (!docId) {
          io.stderr("Missing document id");
          return 1;
        }
        const result = await client.decide(docId);
        io.stdout(JSON.stringify(result, null, 2));
        return 0;
      }
      default:
        io.stdout(usage());
        return 1;
    }
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return mapErrorToExitCode(error);
  }
}

async function main(): Promise<void> {
  const code = await runCli(process.argv);
  process.exit(code);
}

function isExecutedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  void main();
}
