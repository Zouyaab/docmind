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
import { DOCMIND_VERSION } from "@docmind/core";
import { LocalFsBlobStore } from "@docmind/ingestion";
import { createErrorTracker, MetricsRegistry, type ErrorTracker } from "@docmind/observability";
import {
  createStores,
  type DocMindStores,
  type PersistenceMode,
  type PgPool,
} from "@docmind/persistence";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAuthHook } from "./middleware/auth.js";
import { registerErrorHandler } from "./middleware/errors.js";
import { createAppContext } from "./pipeline.js";
import { createProvidersFromConfig } from "./providers.js";
import { registerAskRoutes } from "./routes/ask.js";
import { registerDecideRoutes } from "./routes/decide.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerOpsRoutes } from "./routes/ops.js";
import { registerSearchRoutes } from "./routes/search.js";
import type { ApiDeps } from "./types.js";

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

  registerAuthHook(app, config);
  registerErrorHandler(app, errorTracker, metrics);

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

  const deps: ApiDeps = {
    config,
    stores,
    blobs,
    ctx,
    metrics,
    errorTracker,
    persistenceMode,
    ...(pool ? { pool } : {}),
  };

  await registerOpsRoutes(app, deps);
  await registerDocumentRoutes(app, deps);
  await registerSearchRoutes(app, deps);
  await registerAskRoutes(app, deps);
  await registerDecideRoutes(app, deps);

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
