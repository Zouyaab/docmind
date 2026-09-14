import { DocMindError } from "@docmind/core";
import type { FastifyInstance } from "fastify";
import { decideForDocument } from "../pipeline.js";
import { decideSchema, errorResponseSchema } from "../schemas.js";
import type { ApiDeps } from "../types.js";

export async function registerDecideRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { stores, ctx, metrics } = deps;

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
}
