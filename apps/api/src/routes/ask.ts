import { answerQuestion } from "@docmind/rag";
import type { FastifyInstance } from "fastify";
import { askSchema, errorResponseSchema } from "../schemas.js";
import type { ApiDeps } from "../types.js";

export async function registerAskRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { config, ctx, metrics } = deps;

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
}
