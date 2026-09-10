import { describe, expect, it } from "vitest";
import { DocMindError } from "@docmind/core";
import { createDocumentRecord, MemoryDocumentStore } from "./documentStore.js";

function baseDoc() {
  return createDocumentRecord({
    filename: "a.txt",
    mimeType: "text/plain",
    hash: "abc123",
    size: 4,
  });
}

describe("MemoryDocumentStore", () => {
  it("saves and retrieves documents", async () => {
    const store = new MemoryDocumentStore();
    const doc = baseDoc();
    const saved = await store.save(doc);
    expect(saved.id).toBeTruthy();
    expect(await store.get(saved.id)).toEqual(saved);
  });

  it("lists documents in creation order", async () => {
    const store = new MemoryDocumentStore();
    await store.save({ ...baseDoc(), hash: "h1" });
    await store.save({ ...baseDoc(), hash: "h2", filename: "b.txt" });
    expect(await store.list()).toHaveLength(2);
  });

  it("finds by hash and rejects duplicates", async () => {
    const store = new MemoryDocumentStore();
    const saved = await store.save(baseDoc());
    expect(await store.findByHash("abc123")).toEqual(saved);
    const duplicate = { ...baseDoc(), id: "other_id" };
    await expect(store.save(duplicate)).rejects.toThrow(DocMindError);
  });

  it("deletes documents", async () => {
    const store = new MemoryDocumentStore();
    const saved = await store.save(baseDoc());
    expect(await store.delete(saved.id)).toBe(true);
    expect(await store.get(saved.id)).toBeUndefined();
    expect(await store.delete(saved.id)).toBe(false);
  });

  it("updates status", async () => {
    const store = new MemoryDocumentStore();
    const saved = await store.save(baseDoc());
    const updated = await store.updateStatus(saved.id, "completed");
    expect(updated?.status).toBe("completed");
  });
});
