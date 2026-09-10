#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { DOCMIND_VERSION } from "@docmind/core";
import { DocMindClient } from "@docmind/sdk";

function usage(): void {
  console.log(`DocMind CLI v${DOCMIND_VERSION}

Usage:
  docmind --version
  docmind health [--url URL]
  docmind ingest <file> [--url URL]
  docmind ask <question> [--url URL]
  docmind decide <documentId> [--url URL]
`);
}

function getBaseUrl(): string {
  const idx = process.argv.indexOf("--url");
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1]! : "http://127.0.0.1:3000";
}

function getToken(): string | undefined {
  return process.env.API_TOKEN;
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  if (command === "--version" || command === "version") {
    console.log(DOCMIND_VERSION);
    process.exit(0);
  }

  const token = getToken();
  const client = new DocMindClient(
    token ? { baseUrl: getBaseUrl(), token } : { baseUrl: getBaseUrl() },
  );

  try {
    switch (command) {
      case "health": {
        const result = await client.health();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case "ingest": {
        const file = rest.find((a) => !a.startsWith("--"));
        if (!file) {
          console.error("Missing file path");
          process.exit(1);
        }
        const bytes = new Uint8Array(await readFile(file));
        const filename = file.split(/[/\\]/).pop() ?? "upload.txt";
        const doc = await client.upload(filename, bytes);
        const processed = await client.processDocument(doc.id);
        console.log(JSON.stringify({ document: doc, processed }, null, 2));
        break;
      }
      case "ask": {
        const question = rest.filter((a) => !a.startsWith("--")).join(" ");
        if (!question) {
          console.error("Missing question");
          process.exit(1);
        }
        const result = await client.ask(question);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case "decide": {
        const docId = rest.find((a) => !a.startsWith("--"));
        if (!docId) {
          console.error("Missing document id");
          process.exit(1);
        }
        const result = await client.decide(docId);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      default:
        usage();
        process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
