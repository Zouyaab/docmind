import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { loadConfig } from "@docmind/config";
import { DOCMIND_NAME, DOCMIND_VERSION, DocMindError } from "@docmind/core";
import { LocalFsBlobStore, MemoryDocumentStore, ingestDocument } from "@docmind/ingestion";
import { MetricsRegistry } from "@docmind/observability";
import { answerQuestion } from "@docmind/rag";
import Fastify from "fastify";
import { z } from "zod";
import { createAppContext, decideForDocument, processDocument } from "./pipeline.js";

const searchSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(50).optional(),
});

const askSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(50).optional(),
});

const decideSchema = z.object({
  documentId: z.string().min(1),
});

export async function buildServer() {
  const config = loadConfig();
  const metrics = new MetricsRegistry();
  const store = new MemoryDocumentStore();
  const dataDir = join(process.cwd(), ".data", "blobs");
  await mkdir(dataDir, { recursive: true });
  const blobs = new LocalFsBlobStore(dataDir);
  const ctx = createAppContext(store, blobs);

  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  app.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "DocMind API", version: DOCMIND_VERSION },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_BYTES } });

  app.addHook("onRequest", async (request, reply) => {
    if (!config.API_TOKEN) {
      return;
    }
    const auth = request.headers.authorization;
    if (auth !== `Bearer ${config.API_TOKEN}`) {
      reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DocMindError) {
      reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    if (error instanceof z.ZodError) {
      reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: error.message },
      });
      return;
    }
    app.log.error(error);
    reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });

  app.get("/api/v1/health", async () => {
    metrics.increment("health_checks");
    return { status: "ok" };
  });

  app.get("/api/v1/version", async () => ({
    name: DOCMIND_NAME,
    version: DOCMIND_VERSION,
  }));

  app.post("/api/v1/documents", async (request) => {
    const start = Date.now();
    let filename = "upload.txt";
    let bytes: Uint8Array;

    if (request.isMultipart()) {
      const part = await request.file();
      if (!part) {
        throw new DocMindError("VALIDATION_ERROR", "Missing file", 400);
      }
      filename = part.filename;
      bytes = new Uint8Array(await part.toBuffer());
    } else {
      const body = request.body;
      if (typeof body === "string") {
        bytes = new TextEncoder().encode(body);
      } else if (body instanceof Buffer) {
        bytes = new Uint8Array(body);
      } else {
        throw new DocMindError("VALIDATION_ERROR", "Expected multipart file or text body", 400);
      }
    }

    const result = await ingestDocument({
      filename,
      bytes,
      maxBytes: config.MAX_UPLOAD_BYTES,
      store,
      blobs,
    });
    metrics.increment("documents_uploaded");
    metrics.observeLatency("upload_ms", Date.now() - start);
    return result.document;
  });

  app.get("/api/v1/documents", async () => store.list());

  app.get<{ Params: { id: string } }>("/api/v1/documents/:id", async (request) => {
    const doc = await store.get(request.params.id);
    if (!doc) {
      throw new DocMindError("NOT_FOUND", "Document not found", 404);
    }
    return doc;
  });

  app.post<{ Params: { id: string } }>("/api/v1/documents/:id/process", async (request) => {
    const start = Date.now();
    try {
      const processed = await processDocument(ctx, request.params.id);
      metrics.increment("documents_processed");
      metrics.observeLatency("process_ms", Date.now() - start);
      return {
        status: processed.document.status,
        chunks: processed.chunks.length,
        classification: processed.classification,
        vectorCount: processed.vectorCount,
      };
    } catch (error) {
      await store.updateStatus(request.params.id, "failed");
      throw error;
    }
  });

  app.post("/api/v1/search", async (request) => {
    const body = searchSchema.parse(request.body);
    const [queryVector] = await ctx.providers.embedding.embed([body.query]);
    const results = await ctx.vectors.search(queryVector ?? [], body.topK ?? 5);
    metrics.increment("searches");
    return {
      results: results.map((r) => ({
        documentId: r.record.documentId,
        chunkId: r.record.chunkId,
        text: r.record.text,
        score: r.score,
      })),
    };
  });

  app.post("/api/v1/ask", async (request) => {
    const body = askSchema.parse(request.body);
    const result = await answerQuestion({
      query: body.query,
      store: ctx.vectors,
      llm: ctx.providers.llm,
      embedding: ctx.providers.embedding,
      topK: body.topK ?? 5,
    });
    metrics.increment("ask_requests");
    return result;
  });

  app.post("/api/v1/decide", async (request) => {
    const body = decideSchema.parse(request.body);
    const doc = await store.get(body.documentId);
    if (!doc) {
      throw new DocMindError("NOT_FOUND", "Document not found", 404);
    }
    if (!ctx.classificationCache.has(body.documentId)) {
      await processDocument(ctx, body.documentId);
    }
    const decision = decideForDocument(ctx, body.documentId);
    metrics.increment("decisions");
    return decision;
  });

  app.get("/api/v1/metrics", async () => ({
    counters: metrics.snapshotCounters(),
    latencies: metrics.snapshotLatencies(),
  }));

  return { app, config, store, blobs, ctx, metrics };
}

export async function startServer() {
  const { app, config } = await buildServer();
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  return app;
}
