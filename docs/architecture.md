# DocMind Architecture

DocMind is a **local-first AI Document Intelligence & Decision Engine**.

## Pipeline

```text
Ingest → Extract/Chunk → Classify → Structured Extract
      → Embed → Search → RAG → Deterministic Decisions
```

LLM providers interpret and extract. A separate **decision engine** applies deterministic rules.

## Monorepo layout

| Path                       | Responsibility                        |
| -------------------------- | ------------------------------------- |
| `packages/core`            | Domain types, IDs, confidence, errors |
| `packages/config`          | Environment parsing                   |
| `packages/ingestion`       | Secure upload, MIME, hashing, storage |
| `packages/extraction`      | Parse text, chunk with provenance     |
| `packages/ai`              | LLM + embedding provider abstractions |
| `packages/classification`  | Document type classification          |
| `packages/embeddings`      | Chunk embedding orchestration         |
| `packages/retrieval`       | Vector store + semantic search        |
| `packages/rag`             | Citation-aware Q&A                    |
| `packages/decision-engine` | Deterministic risk/decision rules     |
| `packages/evaluation`      | Offline metrics over fixtures         |
| `packages/observability`   | Metrics + error tracking              |
| `packages/sdk`             | Typed HTTP client                     |
| `packages/cli`             | `docmind` CLI                         |
| `apps/api`                 | Fastify API + OpenAPI                 |
| `apps/web`                 | Vite dashboard                        |

## Design decisions

1. **pnpm workspaces + TypeScript project references** — one lockfile, typed packages.
2. **Provider interfaces** — swappable LLM, embedding, vector, and document stores.
3. **Mock providers in default tests** — no Ollama/internet required for CI.
4. **In-memory stores for unit/e2e** — Postgres/pgvector optional via Docker.
5. **Prompt injection boundary** — document text is untrusted data, never system instructions.
6. **Evidence everywhere** — extraction, classification, RAG, and decisions carry source refs.

## Quality gates

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build
```
