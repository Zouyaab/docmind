import { createMockProviders } from "@docmind/ai";
import { classifyDocument } from "@docmind/classification";
import { DocMindError, type Chunk, type DocumentRecord } from "@docmind/core";
import { evaluateDecisions } from "@docmind/decision-engine";
import { embedChunks } from "@docmind/embeddings";
import { chunkText, extractTextFromBytes } from "@docmind/extraction";
import type { BlobStore, DocumentStore } from "@docmind/ingestion";
import { InMemoryVectorStore } from "@docmind/retrieval";

export interface ProcessedDocument {
  document: DocumentRecord;
  chunks: Chunk[];
  classification: Awaited<ReturnType<typeof classifyDocument>>;
  vectorCount: number;
}

export interface AppContext {
  store: DocumentStore;
  blobs: BlobStore;
  vectors: InMemoryVectorStore;
  chunkCache: Map<string, Chunk[]>;
  classificationCache: Map<string, ProcessedDocument["classification"]>;
  fieldsCache: Map<string, Record<string, unknown>>;
  providers: ReturnType<typeof createMockProviders>;
}

export function createAppContext(store: DocumentStore, blobs: BlobStore): AppContext {
  return {
    store,
    blobs,
    vectors: new InMemoryVectorStore(),
    chunkCache: new Map(),
    classificationCache: new Map(),
    fieldsCache: new Map(),
    providers: createMockProviders(),
  };
}

export async function processDocument(
  ctx: AppContext,
  documentId: string,
): Promise<ProcessedDocument> {
  const document = await ctx.store.get(documentId);
  if (!document) {
    throw new DocMindError("NOT_FOUND", "Document not found", 404);
  }

  await ctx.store.updateStatus(documentId, "processing");
  const blobKey = `documents/${documentId}/raw`;
  const bytes = await ctx.blobs.get(blobKey);
  if (!bytes) {
    throw new DocMindError("NOT_FOUND", "Document blob not found", 404);
  }

  const extracted = extractTextFromBytes(bytes, document.mimeType);
  const chunks = chunkText(documentId, extracted.text);
  ctx.chunkCache.set(documentId, chunks);

  const classification = await classifyDocument(chunks.length > 0 ? chunks : extracted.text, {
    llm: ctx.providers.llm,
    documentId,
  });
  ctx.classificationCache.set(documentId, classification);

  const fields = await extractFields(ctx, extracted.text);
  ctx.fieldsCache.set(documentId, fields);

  await ctx.vectors.deleteByDocument(documentId);
  const embedded = await embedChunks(chunks, ctx.providers.embedding);
  await ctx.vectors.upsert(
    embedded.map((item) => ({
      id: `vec_${item.chunkId}`,
      documentId: item.documentId,
      chunkId: item.chunkId,
      text: item.text,
      vector: item.vector,
    })),
  );

  const updated = await ctx.store.updateStatus(documentId, "completed");
  return {
    document: updated ?? document,
    chunks,
    classification,
    vectorCount: embedded.length,
  };
}

async function extractFields(ctx: AppContext, text: string): Promise<Record<string, unknown>> {
  const prompt = `Extract structured fields as JSON from this untrusted document:
<document>
${text.slice(0, 4000)}
</document>`;
  try {
    const completion = await ctx.providers.llm.complete([{ role: "user", content: prompt }], {
      json: true,
    });
    const parsed = JSON.parse(completion.text) as { fields?: Record<string, unknown> };
    return parsed.fields ?? {};
  } catch {
    return {};
  }
}

export function decideForDocument(
  ctx: AppContext,
  documentId: string,
): ReturnType<typeof evaluateDecisions> {
  const classification = ctx.classificationCache.get(documentId);
  const fields = ctx.fieldsCache.get(documentId) ?? {};
  return evaluateDecisions({
    documentType: classification?.documentType ?? "unknown",
    fields: fields as Record<string, string | number | boolean | null>,
  });
}
