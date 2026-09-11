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
import { LocalFsBlobStore, ingestDocument } from "@docmind/ingestion";
import { createErrorTracker, MetricsRegistry, type ErrorTracker } from "@docmind/observability";
import {
  checkPostgresHealth,
  createStores,
  type DocMindStores,
  type PersistenceMode,
  type PgPool,
} from "@docmind/persistence";
import { answerQuestion } from "@docmind/rag";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { createAppContext, decideForDocument, processDocument } from "./pipeline.js";
import { createProvidersFromConfig } from "./providers.js";

const documentIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid document id");

const searchSchema = z
  .object({
    query: z.string().min(1).max(4_000),
    topK: z.number().int().positive().max(50).optional(),
    documentId: documentIdSchema.optional(),
  })
  .strict();

const askSchema = z
  .object({
    query: z.string().min(1).max(4_000),
    topK: z.number().int().positive().max(50).optional(),
    documentId: documentIdSchema.optional(),
    minScore: z.number().min(0).max(1).optional(),
  })
  .strict();

const decideSchema = z
  .object({
    documentId: documentIdSchema,
  })
  .strict();

const PUBLIC_PATHS = new Set([
  "/api/v1/health",
  "/api/v1/ready",
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

const errorResponseSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
} as const;

export interface BuildServerOptions {
  config?: DocMindConfig;
  errorTracker?: ErrorTracker;
  metrics?: MetricsRegistry;
  stores?: DocMindStores;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<{
  app: FastifyInstance;
  config: DocMindConfig;
  stores: DocMindStores;
  blobs: LocalFsBlobStore;
  ctx: ReturnType<typeof createAppContext>;
  metrics: MetricsRegistry;
  errorTracker: ErrorTracker;
  persistenceMode: PersistenceMode;
  pool?: PgPool | undefined;
}> {
  const config = options.config ?? loadConfig();
  const metrics = options.metrics ?? new MetricsRegistry();
  const errorTracker = options.errorTracker ?? createErrorTracker();

  const created =
    options.stores != null
      ? { mode: "memory" as const, stores: options.stores }
      : await createStores({
          ...(config.DATABASE_URL ? { databaseUrl: config.DATABASE_URL } : {}),
          embeddingDimensions: config.EMBEDDING_DIMENSIONS,
        });

  const stores = created.stores;
  const persistenceMode = created.mode;
  const pool = "pool" in created ? created.pool : undefined;

  const dataDir = join(process.cwd(), ".data", "blobs");
  await mkdir(dataDir, { recursive: true });
  const blobs = new LocalFsBlobStore(dataDir);
  const providers = createProvidersFromConfig(config);
  const ctx = createAppContext(stores, blobs, providers, config);

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
    max: config.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    allowList: (request) => {
      const path = request.url.split("?")[0] ?? request.url;
      return path === "/api/v1/health" || path === "/api/v1/ready";
    },
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "DocMind API",
        version: DOCMIND_VERSION,
        description: "Local-first AI Document Intelligence & Decision Engine",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
          },
        },
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

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : undefined;

    if (statusCode === 429) {
      metrics.increment("errors", { code: "RATE_LIMITED" });
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: error instanceof Error ? error.message : "Rate limit exceeded",
        },
      });
    }

    if (
      statusCode === 400 ||
      (error as { validation?: unknown }).validation != null ||
      (error as { code?: string }).code === "FST_ERR_VALIDATION"
    ) {
      metrics.increment("errors", { code: "VALIDATION_ERROR" });
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Request validation failed",
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

  app.get(
    "/api/v1/health",
    {
      schema: {
        tags: ["ops"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              persistence: { type: "string" },
              database: { type: "string" },
            },
          },
        },
      },
    },
    async () => {
      metrics.increment("health_checks");
      let database: "disabled" | "ok" | "error" = "disabled";
      if (pool) {
        database = (await checkPostgresHealth(pool)) ? "ok" : "error";
      }
      return {
        status: database === "error" ? "degraded" : "ok",
        persistence: persistenceMode,
        database,
      };
    },
  );

  app.get(
    "/api/v1/ready",
    {
      schema: {
        tags: ["ops"],
        response: {
          200: {
            type: "object",
            properties: {
              ready: { type: "boolean" },
              persistence: { type: "string" },
              database: { type: "string" },
            },
          },
          503: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      let database: "disabled" | "ok" | "error" = "disabled";
      if (pool) {
        database = (await checkPostgresHealth(pool)) ? "ok" : "error";
      }
      const ready = database !== "error";
      const body = { ready, persistence: persistenceMode, database };
      if (!ready) {
        return reply.code(503).send(body);
      }
      return body;
    },
  );

  app.get(
    "/api/v1/version",
    {
      schema: {
        tags: ["ops"],
        response: {
          200: {
            type: "object",
            properties: {
              name: { type: "string" },
              version: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({
      name: DOCMIND_NAME,
      version: DOCMIND_VERSION,
    }),
  );

  app.post(
    "/api/v1/documents",
    {
      schema: {
        tags: ["documents"],
        consumes: ["multipart/form-data", "text/plain"],
        response: {
          200: {
            type: "object",
            properties: {
              document: { type: "object", additionalProperties: true },
              duplicate: { type: "boolean" },
            },
          },
          400: errorResponseSchema,
        },
      },
    },
    async (request) => {
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
        store: stores.documents,
        blobs,
      });
      metrics.increment("documents_uploaded");
      metrics.observeLatency("upload_ms", Date.now() - start);
      return { document: result.document, duplicate: result.duplicate };
    },
  );

  app.get(
    "/api/v1/documents",
    {
      schema: {
        tags: ["documents"],
        response: { 200: { type: "array", items: { type: "object", additionalProperties: true } } },
      },
    },
    async () => stores.documents.list(),
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/documents/:id",
    {
      schema: {
        tags: ["documents"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const id = documentIdSchema.parse(request.params.id);
      const doc = await stores.documents.get(id);
      if (!doc) {
        throw new DocMindError("NOT_FOUND", "Document not found", 404);
      }
      return doc;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/documents/:id/process",
    {
      schema: {
        tags: ["documents"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              chunks: { type: "number" },
              classification: { type: "object", additionalProperties: true },
              vectorCount: { type: "number" },
              extractionStatus: { type: "string" },
            },
          },
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
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
          extractionStatus: processed.extractionStatus,
        };
      } catch (error) {
        await stores.documents.updateStatus(id, "failed");
        throw error;
      }
    },
  );

  app.post(
    "/api/v1/search",
    {
      schema: {
        tags: ["retrieval"],
        body: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            topK: { type: "number" },
            documentId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              results: { type: "array", items: { type: "object", additionalProperties: true } },
            },
          },
          400: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const body = searchSchema.parse(request.body);
      const [queryVector] = await ctx.providers.embedding.embed([body.query]);
      const results = await ctx.stores.vectors.search(queryVector ?? [], {
        topK: body.topK ?? 5,
        ...(body.documentId ? { documentId: body.documentId } : {}),
      });
      metrics.increment("searches");
      return {
        results: results.map((r) => ({
          documentId: r.record.documentId,
          chunkId: r.record.chunkId,
          text: r.record.text,
          score: r.score,
          metadata: r.record.metadata ?? {},
        })),
      };
    },
  );

  app.post(
    "/api/v1/ask",
    {
      schema: {
        tags: ["retrieval"],
        body: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            topK: { type: "number" },
            documentId: { type: "string" },
            minScore: { type: "number" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              answer: { type: "string" },
              citations: { type: "array", items: { type: "object", additionalProperties: true } },
              insufficientEvidence: { type: "boolean" },
              grounded: { type: "boolean" },
              injectionBlocked: { type: "boolean" },
              scores: { type: "array", items: { type: "number" } },
            },
          },
          400: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const body = askSchema.parse(request.body);
      const result = await answerQuestion({
        query: body.query,
        store: ctx.stores.vectors,
        llm: ctx.providers.llm,
        embedding: ctx.providers.embedding,
        topK: body.topK ?? 5,
        minScore: body.minScore ?? config.RAG_MIN_SCORE,
        ...(body.documentId ? { documentId: body.documentId } : {}),
      });
      metrics.increment("ask_requests");
      return result;
    },
  );

  app.post(
    "/api/v1/decide",
    {
      schema: {
        tags: ["decisions"],
        body: {
          type: "object",
          required: ["documentId"],
          properties: { documentId: { type: "string" } },
        },
        response: {
          200: { type: "object", additionalProperties: true },
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const body = decideSchema.parse(request.body);
      const doc = await stores.documents.get(body.documentId);
      if (!doc) {
        throw new DocMindError("NOT_FOUND", "Document not found", 404);
      }
      const decision = await decideForDocument(ctx, body.documentId);
      metrics.increment("decisions");
      return decision;
    },
  );

  app.get(
    "/api/v1/metrics",
    {
      schema: {
        tags: ["ops"],
        response: {
          200: {
            type: "object",
            properties: {
              counters: { type: "array", items: { type: "object", additionalProperties: true } },
              latencies: { type: "array", items: { type: "object", additionalProperties: true } },
              persistence: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({
      counters: metrics.snapshotCounters(),
      latencies: metrics.snapshotLatencies(),
      persistence: persistenceMode,
    }),
  );

  app.addHook("onClose", async () => {
    if (pool) {
      await pool.end();
    }
  });

  return {
    app,
    config,
    stores,
    blobs,
    ctx,
    metrics,
    errorTracker,
    persistenceMode,
    ...(pool ? { pool } : {}),
  };
}

export async function startServer() {
  const { app, config } = await buildServer();
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  return app;
}
