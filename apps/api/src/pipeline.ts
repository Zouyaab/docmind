import { classifyDocument } from "@docmind/classification";
import type { DocMindConfig } from "@docmind/config";
import { DocMindError, type Chunk, type DocumentRecord, type Evidence } from "@docmind/core";
import {
  buildEvidenceByField,
  evaluateDecisions,
  type DecisionResult,
} from "@docmind/decision-engine";
import { embedChunks } from "@docmind/embeddings";
import { chunkExtractedDocument, extractTextFromBytes } from "@docmind/extraction";
import type { BlobStore } from "@docmind/ingestion";
import type { DocMindStores } from "@docmind/persistence";
import type { EmbeddingProvider, LLMProvider } from "@docmind/ai";

export interface ProcessedDocument {
  document: DocumentRecord;
  chunks: Chunk[];
  classification: Awaited<ReturnType<typeof classifyDocument>>;
  vectorCount: number;
  extractionStatus: string;
}

export interface AppContext {
  stores: DocMindStores;
  blobs: BlobStore;
  providers: { llm: LLMProvider; embedding: EmbeddingProvider };
  config: DocMindConfig;
}

export function createAppContext(
  stores: DocMindStores,
  blobs: BlobStore,
  providers: { llm: LLMProvider; embedding: EmbeddingProvider },
  config: DocMindConfig,
): AppContext {
  return { stores, blobs, providers, config };
}

export async function processDocument(
  ctx: AppContext,
  documentId: string,
): Promise<ProcessedDocument> {
  const document = await ctx.stores.documents.get(documentId);
  if (!document) {
    throw new DocMindError("NOT_FOUND", "Document not found", 404);
  }

  await ctx.stores.documents.updateStatus(documentId, "processing");
  const blobKey = `documents/${documentId}/raw`;
  const bytes = await ctx.blobs.get(blobKey);
  if (!bytes) {
    throw new DocMindError("NOT_FOUND", "Document blob not found", 404);
  }

  const extracted = extractTextFromBytes(bytes, document.mimeType);
  if (extracted.status === "failed" || extracted.status === "unsupported_binary") {
    await ctx.stores.documents.updateStatus(documentId, "failed");
    throw new DocMindError(
      "EXTRACTION_FAILED",
      extracted.note ?? "Document text extraction failed",
      422,
    );
  }
  if (extracted.status === "empty" || extracted.status === "scanned_or_image_only") {
    await ctx.stores.documents.updateStatus(documentId, "failed");
    throw new DocMindError(
      "EXTRACTION_EMPTY",
      extracted.note ?? "No extractable text in document",
      422,
    );
  }

  const chunks = chunkExtractedDocument(documentId, extracted);
  await ctx.stores.chunks.replaceForDocument(documentId, chunks);

  const classification = await classifyDocument(chunks.length > 0 ? chunks : extracted.text, {
    llm: ctx.providers.llm,
    documentId,
  });
  await ctx.stores.classifications.save({
    documentId,
    documentType: classification.documentType,
    confidence: classification.confidence,
    band: classification.band,
    evidence: classification.evidence,
    updatedAt: new Date().toISOString(),
  });

  const fields = await extractFields(ctx, extracted.text);
  await ctx.stores.fields.save(documentId, fields);

  await ctx.stores.vectors.deleteByDocument(documentId);
  const embedded = await embedChunks(chunks, ctx.providers.embedding);
  await ctx.stores.vectors.upsert(
    embedded.map((item) => ({
      id: `vec_${item.chunkId}`,
      documentId: item.documentId,
      chunkId: item.chunkId,
      text: item.text,
      vector: item.vector,
      metadata: {
        pageNumber: chunks.find((c) => c.id === item.chunkId)?.pageNumber,
        section: chunks.find((c) => c.id === item.chunkId)?.metadata?.section,
      },
    })),
  );

  if (extracted.pageCount != null) {
    const withPages = {
      ...document,
      pageCount: extracted.pageCount,
      updatedAt: new Date().toISOString(),
    };
    await ctx.stores.documents.save(withPages);
  }

  const updated = await ctx.stores.documents.updateStatus(documentId, "completed");
  return {
    document: updated ?? document,
    chunks,
    classification,
    vectorCount: embedded.length,
    extractionStatus: extracted.status,
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

export async function decideForDocument(
  ctx: AppContext,
  documentId: string,
): Promise<DecisionResult> {
  let classification = await ctx.stores.classifications.get(documentId);
  let fields = (await ctx.stores.fields.get(documentId)) ?? {};
  if (!classification) {
    await processDocument(ctx, documentId);
    classification = await ctx.stores.classifications.get(documentId);
    fields = (await ctx.stores.fields.get(documentId)) ?? {};
  }

  const chunks = await ctx.stores.chunks.listByDocument(documentId);
  const evidenceByField = buildEvidenceByField(documentId, fields, chunks);
  if (classification?.evidence?.length) {
    evidenceByField.documentType = classification.evidence as Evidence[];
  }

  const decision = evaluateDecisions(
    {
      documentType: classification?.documentType ?? "unknown",
      fields: fields as Record<string, string | number | boolean | null>,
    },
    undefined,
    evidenceByField,
  );
  await ctx.stores.decisions.save(documentId, decision);
  return decision;
}
