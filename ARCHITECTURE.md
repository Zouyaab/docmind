# DocMind Architecture

## Product

DocMind is a **local-first AI Document Intelligence & Decision Engine**.

It turns unstructured documents into auditable structured results through:

```text
Ingest → Extract/Chunk → Classify → Structured Extract
      → Embed → Search → RAG → Deterministic Decisions
```

LLM providers interpret and extract. A separate **decision engine** applies deterministic rules.

## Monorepo layout

| Path                       | Responsibility                                        |
| -------------------------- | ----------------------------------------------------- |
| `packages/core`            | Domain types, IDs, confidence, errors                 |
| `packages/config`          | Environment parsing                                   |
| `packages/ingestion`       | Secure upload, MIME, hashing, storage                 |
| `packages/extraction`      | Parse text, chunk with provenance                     |
| `packages/ai`              | LLM + embedding provider abstractions (Ollama + Mock) |
| `packages/classification`  | Document type classification                          |
| `packages/embeddings`      | Chunk embedding orchestration                         |
| `packages/retrieval`       | Vector store + semantic search                        |
| `packages/rag`             | Citation-aware Q&A                                    |
| `packages/decision-engine` | Deterministic risk/decision rules                     |
| `packages/evaluation`      | Offline metrics over fixtures                         |
| `packages/observability`   | Metrics + structured error tracking                   |
| `packages/sdk`             | Typed HTTP client                                     |
| `packages/cli`             | `docmind` CLI                                         |
| `apps/api`                 | Fastify API + OpenAPI                                 |
| `apps/web`                 | Vite static dashboard                                 |
| `tests/`                   | Offline e2e pipeline tests                            |

## Design decisions

1. **pnpm workspaces + TypeScript project references** — one lockfile, typed packages.
2. **Provider interfaces** — `LLMProvider`, `EmbeddingProvider`, `VectorStore`, `DocumentStore` are swappable.
3. **Mock providers in default tests** — no Ollama/internet required for CI.
4. **In-memory stores for unit/e2e** — Postgres/pgvector wired via `DATABASE_URL` / Docker Compose.
5. **Prompt injection boundary** — document text is always untrusted content, never system instructions.
6. **Evidence everywhere** — extraction, classification, RAG, and decisions carry source chunk/page refs.

## Quality gates

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage && pnpm build
```
