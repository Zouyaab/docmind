import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DocMindError } from "@docmind/core";
import { LocalFsBlobStore } from "./blobStore.js";

describe("LocalFsBlobStore", () => {
  it("stores and reads blobs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "docmind-blob-"));
    try {
      const store = new LocalFsBlobStore(root);
      const bytes = new TextEncoder().encode("payload");
      await store.put("doc-1.bin", bytes);
      expect(await store.get("doc-1.bin")).toEqual(bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks path traversal keys", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "docmind-blob-"));
    try {
      const store = new LocalFsBlobStore(root);
      await expect(store.put("../escape.bin", new Uint8Array([1]))).rejects.toThrow(DocMindError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports nested paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "docmind-blob-"));
    try {
      const store = new LocalFsBlobStore(root);
      const bytes = new TextEncoder().encode("nested");
      await store.put("documents/doc-1/raw", bytes);
      expect(await store.get("documents/doc-1/raw")).toEqual(bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("deletes missing blobs gracefully", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "docmind-blob-"));
    try {
      const store = new LocalFsBlobStore(root);
      expect(await store.delete("missing.bin")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
