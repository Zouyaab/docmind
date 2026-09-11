import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMockProviders } from "@docmind/ai";
import { classifyDocument } from "@docmind/classification";
import { evaluateDecisions } from "@docmind/decision-engine";
import { embedChunks } from "@docmind/embeddings";
import { chunkText, extractTextFromBytes } from "@docmind/extraction";
import { LocalFsBlobStore, MemoryDocumentStore, ingestDocument } from "@docmind/ingestion";
import { answerQuestion } from "@docmind/rag";
import { InMemoryVectorStore } from "@docmind/retrieval";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const fixturesDir = join(import.meta.dirname, "../fixtures");

describe("offline e2e pipeline", () => {
  it("ingests contract fixture through full pipeline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "docmind-e2e-"));
    try {
      const store = new MemoryDocumentStore();
      const blobs = new LocalFsBlobStore(dir);
      const bytes = new Uint8Array(await readFile(join(fixturesDir, "contract.txt")));

      const ingested = await ingestDocument({
        filename: "contract.txt",
        bytes,
        maxBytes: 1_000_000,
        store,
        blobs,
      });
      expect(ingested.duplicate).toBe(false);

      const extracted = extractTextFromBytes(bytes, ingested.document.mimeType);
      expect(extracted.status).toBe("ok");

      const chunks = chunkText(ingested.document.id, extracted.text);
      expect(chunks.length).toBeGreaterThan(0);

      const { llm, embedding } = createMockProviders();
      const classification = await classifyDocument(chunks, {
        llm,
        documentId: ingested.document.id,
      });
      expect(classification.documentType).toBe("contract");

      const embedded = await embedChunks(chunks, embedding);
      const vectors = new InMemoryVectorStore();
      await vectors.upsert(
        embedded.map((e) => ({
          id: `vec_${e.chunkId}`,
          documentId: e.documentId,
          chunkId: e.chunkId,
          text: e.text,
          vector: e.vector,
        })),
      );

      const search = await vectors.search(embedded[0]!.vector, 3);
      expect(search.length).toBeGreaterThan(0);

      const rag = await answerQuestion({
        query: "What is the notice period?",
        store: vectors,
        llm,
        embedding,
        topK: 3,
        minScore: 0,
      });
      expect(rag.answer.length).toBeGreaterThan(0);
      expect(rag.citations.length).toBeGreaterThan(0);

      const fields = {
        companyName: "DocMind Demo Corp",
        expirationDate: "2027-12-31",
        autoRenewal: true,
        noticePeriodDays: 14,
        contractValue: 125_000,
      };
      const decision = evaluateDecisions({
        documentType: classification.documentType,
        fields,
      });
      expect(decision.decision).toBe("REVIEW_REQUIRED");
      expect(decision.risks.some((r) => r.rule === "SHORT_TERMINATION_NOTICE")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("classifies invoice fixture", async () => {
    const bytes = new Uint8Array(await readFile(join(fixturesDir, "invoice.txt")));
    const extracted = extractTextFromBytes(bytes, "text/plain");
    const result = await classifyDocument(extracted.text);
    expect(result.documentType).toBe("invoice");
  });
});
