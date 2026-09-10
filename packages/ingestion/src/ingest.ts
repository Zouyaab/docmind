import { sha256Hex } from "@docmind/core";
import type { BlobStore } from "./blobStore.js";
import { createDocumentRecord, type DocumentStore } from "./documentStore.js";
import { validateUpload } from "./validate.js";

export interface IngestResult {
  document: import("@docmind/core").DocumentRecord;
  duplicate: boolean;
  blobKey: string;
}

export async function ingestDocument(input: {
  filename: string;
  bytes: Uint8Array;
  maxBytes: number;
  store: DocumentStore;
  blobs: BlobStore;
}): Promise<IngestResult> {
  const validated = validateUpload(input.filename, input.bytes, {
    maxBytes: input.maxBytes,
  });
  const hash = sha256Hex(input.bytes);
  const existing = await input.store.findByHash(hash);

  if (existing) {
    return {
      document: existing,
      duplicate: true,
      blobKey: `documents/${existing.id}/raw`,
    };
  }

  const doc = createDocumentRecord({
    filename: validated.filename,
    mimeType: validated.mimeType,
    size: validated.sizeBytes,
    hash,
  });
  const blobKey = `documents/${doc.id}/raw`;
  await input.blobs.put(blobKey, input.bytes);
  await input.store.save(doc);

  return { document: doc, duplicate: false, blobKey };
}
