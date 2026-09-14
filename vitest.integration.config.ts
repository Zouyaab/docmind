import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = {
  "@docmind/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
  "@docmind/config": fileURLToPath(new URL("./packages/config/src/index.ts", import.meta.url)),
  "@docmind/observability": fileURLToPath(
    new URL("./packages/observability/src/index.ts", import.meta.url),
  ),
  "@docmind/ingestion": fileURLToPath(
    new URL("./packages/ingestion/src/index.ts", import.meta.url),
  ),
  "@docmind/extraction": fileURLToPath(
    new URL("./packages/extraction/src/index.ts", import.meta.url),
  ),
  "@docmind/ai": fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)),
  "@docmind/classification": fileURLToPath(
    new URL("./packages/classification/src/index.ts", import.meta.url),
  ),
  "@docmind/embeddings": fileURLToPath(
    new URL("./packages/embeddings/src/index.ts", import.meta.url),
  ),
  "@docmind/retrieval": fileURLToPath(
    new URL("./packages/retrieval/src/index.ts", import.meta.url),
  ),
  "@docmind/persistence": fileURLToPath(
    new URL("./packages/persistence/src/index.ts", import.meta.url),
  ),
  "@docmind/rag": fileURLToPath(new URL("./packages/rag/src/index.ts", import.meta.url)),
  "@docmind/decision-engine": fileURLToPath(
    new URL("./packages/decision-engine/src/index.ts", import.meta.url),
  ),
  "@docmind/sdk": fileURLToPath(new URL("./packages/sdk/src/index.ts", import.meta.url)),
  "@docmind/evaluation": fileURLToPath(
    new URL("./packages/evaluation/src/index.ts", import.meta.url),
  ),
};

/**
 * Opt-in suites for real services (Postgres / Ollama).
 * Not merged with vitest.config.ts — that config excludes these files.
 */
export default defineConfig({
  test: {
    include: ["**/*.integration.test.ts", "**/*.ollama.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    testTimeout: 60_000,
    passWithNoTests: true,
  },
  resolve: { alias },
});
