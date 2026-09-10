import { z } from "zod";
import { DocMindError } from "@docmind/core";

const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

const configSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2"),
  DATABASE_URL: z.string().url().optional(),
  LOG_LEVEL: logLevelSchema.default("info"),
  API_TOKEN: z.string().min(1).optional(),
});

export type DocMindConfig = z.infer<typeof configSchema>;

function normalizeEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === "") {
      normalized[key] = undefined;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): DocMindConfig {
  const result = configSchema.safeParse(normalizeEnv(env));

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new DocMindError(
      "CONFIG_ERROR",
      `Invalid configuration: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      500,
    );
  }

  return result.data;
}
