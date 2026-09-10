import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocMindError } from "@docmind/core";
import { LocalFsBlobStore } from "./blobStore.js";
import { MemoryDocumentStore } from "./documentStore.js";
import { ingestDocument } from "./ingest.js";
import { safeFilename } from "./mime.js";
import { validateUpload } from "./validate.js";

describe("safeFilename", () => {
  it("strips path segments", () => {
    expect(safeFilename("../../etc/passwd.txt")).toBe("passwd.txt");
  });
});

describe("validateUpload", () => {
  it("accepts plain text", () => {
    const bytes = new TextEncoder().encode("hello DocMind");
    const result = validateUpload("note.txt", bytes, { maxBytes: 1024 });
    expect(result.mimeType).toBe("text/plain");
  });

  it("rejects oversized payloads", () => {
    const bytes = new Uint8Array(2048);
    expect(() => validateUpload("big.txt", bytes, { maxBytes: 1024 })).toThrow(DocMindError);
  });
});

describe("ingestDocument", () => {
  it("dedupes by content hash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "docmind-"));
    try {
      const store = new MemoryDocumentStore();
      const blobs = new LocalFsBlobStore(dir);
      const bytes = new TextEncoder().encode("same content");
      const first = await ingestDocument({
        filename: "a.txt",
        bytes,
        maxBytes: 10_000,
        store,
        blobs,
      });
      const second = await ingestDocument({
        filename: "b.txt",
        bytes,
        maxBytes: 10_000,
        store,
        blobs,
      });
      expect(first.duplicate).toBe(false);
      expect(second.duplicate).toBe(true);
      expect(second.document.id).toBe(first.document.id);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
