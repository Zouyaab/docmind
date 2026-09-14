import { z } from "zod";

export const documentIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid document id");

export const searchSchema = z
  .object({
    query: z.string().min(1).max(4_000),
    topK: z.number().int().positive().max(50).optional(),
    documentId: documentIdSchema.optional(),
  })
  .strict();

export const askSchema = z
  .object({
    query: z.string().min(1).max(4_000),
    topK: z.number().int().positive().max(50).optional(),
    documentId: documentIdSchema.optional(),
    minScore: z.number().min(0).max(1).optional(),
  })
  .strict();

export const decideSchema = z
  .object({
    documentId: documentIdSchema,
  })
  .strict();

export const PUBLIC_PATHS = new Set([
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

export const errorResponseSchema = {
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
