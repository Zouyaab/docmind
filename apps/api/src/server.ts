import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { loadConfig, type DocMindConfig } from "@docmind/config";
import { DOCMIND_NAME, DOCMIND_VERSION, DocMindError } from "@docmind/core";
import { LocalFsBlobStore, MemoryDocumentStore, ingestDocument } from "@docmind/ingestion";
import { createErrorTracker, MetricsRegistry, type ErrorTracker } from "@docmind/observability";
import { answerQuestion } from "@docmind/rag";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { createAppContext, decideForDocument, processDocument } from "./pipeline.js";

const documentIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid document id");

const searchSchema = z
  .object({
    query: z.string().min(1).max(4_000),
    topK: z.number().int().positive().max(50).optional(),
  })
  .strict();

const askSchema = z
  .object({
    query: z.string().min(1).max(4_000),
    topK: z.number().int().positive().max(50).optional(),
  })
  .strict();

const decideSchema = z
  .object({
    documentId: documentIdSchema,
  })
  .strict();

const PUBLIC_PATHS = new Set([
  "/api/v1/health",
  "/api/v1/version",
  "/docs",
  "/docs/",
  "/docs/json",
  "/docs/yaml",
  "/docs/static/index.html",
  "/docs/static/swagger-ui.css",
  "/docs/static/swagger-ui-bundle.js",
  "/docs/static/swagger-ui-standalone-preset.js",
]);

export interface BuildServerOptions {
  config?: DocMindConfig;
  errorTracker?: ErrorTracker;
  metrics?: MetricsRegistry;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<{
  app: FastifyInstance;
  config: DocMindConfig;
  store: MemoryDocumentStore;
  blobs: LocalFsBlobStore;
  ctx: ReturnType<typeof createAppContext>;
  metrics: MetricsRegistry;
  errorTracker: ErrorTracker;
}> {
  const config = options.config ?? loadConfig();
  const metrics = options.metrics ?? new MetricsRegistry();
  const errorTracker = options.errorTracker ?? createErrorTracker();
  const store = new MemoryDocumentStore();
  const dataDir = join(process.cwd(), ".data", "blobs");
  await mkdir(dataDir, { recursive: true });
  const blobs = new LocalFsBlobStore(dataDir);
  const ctx = createAppContext(store, blobs);

  const app = Fastify({
    genReqId: () => randomUUID(),
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    disableRequestLogging: false,
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "headers.authorization",
          "headers.cookie",
        ],
        censor: "[REDACTED]",
      },
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            requestId: request.id,
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
  });

  app.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    allowList: (request) => request.url.startsWith("/api/v1/health"),
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "DocMind API",
        version: DOCMIND_VERSION,
        description: "Local-first AI Document Intelligence & Decision Engine",
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_BYTES } });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (!config.API_TOKEN) {
      return;
    }
    const path = request.url.split("?")[0] ?? request.url;
    if (PUBLIC_PATHS.has(path) || path.startsWith("/docs/")) {
      return;
    }
    const auth = request.headers.authorization;
    if (auth !== `Bearer ${config.API_TOKEN}`) {
      return reply.code(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or missing Bearer token" },
      });
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "request completed",
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const tracked = errorTracker.track(error, {
      requestId: request.id,
      method: request.method,
      url: request.url,
    });

    if (error instanceof DocMindError) {
      metrics.increment("errors", { code: error.code });
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof z.ZodError) {
      metrics.increment("errors", { code: "VALIDATION_ERROR" });
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    metrics.increment("errors", { code: "INTERNAL_ERROR" });
    request.log.error(
      {
        requestId: request.id,
        errorCode: tracked.code ?? "INTERNAL_ERROR",
        err: { message: tracked.message },
      },
      "unhandled error",
    );
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
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
    const id = documentIdSchema.parse(request.params.id);
    const doc = await store.get(id);
    if (!doc) {
      throw new DocMindError("NOT_FOUND", "Document not found", 404);
    }
    return doc;
  });

  app.post<{ Params: { id: string } }>("/api/v1/documents/:id/process", async (request) => {
    const id = documentIdSchema.parse(request.params.id);
    const start = Date.now();
    try {
      const processed = await processDocument(ctx, id);
      metrics.increment("documents_processed");
      metrics.observeLatency("process_ms", Date.now() - start);
      return {
        status: processed.document.status,
        chunks: processed.chunks.length,
        classification: processed.classification,
        vectorCount: processed.vectorCount,
      };
    } catch (error) {
      await store.updateStatus(id, "failed");
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

  return { app, config, store, blobs, ctx, metrics, errorTracker };
}

export async function startServer() {
  const { app, config } = await buildServer();
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  return app;
}
