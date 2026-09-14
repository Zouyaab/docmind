import { DocMindError } from "@docmind/core";
import type { ErrorTracker, MetricsRegistry } from "@docmind/observability";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export function registerErrorHandler(
  app: FastifyInstance,
  errorTracker: ErrorTracker,
  metrics: MetricsRegistry,
): void {
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
}
