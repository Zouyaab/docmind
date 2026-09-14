import type { FastifyInstance } from "fastify";
import { errorResponseSchema, searchSchema } from "../schemas.js";
import type { ApiDeps } from "../types.js";

export async function registerSearchRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { ctx, metrics } = deps;

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
}
