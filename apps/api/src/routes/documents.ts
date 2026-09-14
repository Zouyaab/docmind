import { DocMindError } from "@docmind/core";
import { ingestDocument } from "@docmind/ingestion";
import type { FastifyInstance } from "fastify";
import { processDocument } from "../pipeline.js";
import { documentIdSchema, errorResponseSchema } from "../schemas.js";
import type { ApiDeps } from "../types.js";

export async function registerDocumentRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  const { config, stores, blobs, ctx, metrics } = deps;

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
}
