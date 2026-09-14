import { DOCMIND_NAME, DOCMIND_VERSION } from "@docmind/core";
import { checkPostgresHealth } from "@docmind/persistence";
import type { FastifyInstance } from "fastify";
import { errorResponseSchema } from "../schemas.js";
import type { ApiDeps } from "../types.js";

export async function registerOpsRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { metrics, persistenceMode, pool } = deps;

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
}
