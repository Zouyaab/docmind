# DocMind MVP Limitations

This MVP is designed for **offline, local development and evaluation**. Known limitations:

## Extraction

- PDF parsing uses a heuristic stream extractor with **page-aware provenance** (page numbers +
  section headings on chunks). It is still not a production PDF library.
- Scanned PDFs and complex layouts are not supported (returned as `EXTRACTION_EMPTY` / scanned status).
- Plain text / markdown with form-feed (`\\f`) page breaks is chunked per page.

## AI providers

- Default runtime uses **mock** LLM and embedding providers.
- Ollama providers exist but are opt-in (`AI_PROVIDER=ollama`) and excluded from default CI tests (`*.ollama.test.ts`).
- No cloud LLM integrations in this MVP.

## Storage

- **Default (no `DATABASE_URL`)**: document metadata, chunks, classifications, fields, decisions, and vectors are **in-memory** (lost on process restart). Ideal for unit tests and quick local demos.
- **With `DATABASE_URL`**: `@docmind/persistence` uses PostgreSQL + **pgvector** for durable documents, chunks, embeddings, classifications, fields, and decisions. Docker Compose enables this by default.
- Blob storage uses the local filesystem under `.data/blobs`.
- Postgres schema defaults to `vector(32)` for the mock provider. Setting
  `EMBEDDING_DIMENSIONS` applies that size on first migration and can resize an
  **empty** embeddings column. Changing dimensions with existing vectors fails
  with a clear error until the table is cleared.

## Security

- Prompt injection guards combine pattern matching, untrusted-context sanitization, and answer grounding checks.
- No user accounts, RBAC, or encryption at rest.
- Optional single shared API token only.
- The Vite dashboard does not collect an API token UI; when `API_TOKEN` is set, call the API via CLI/SDK or configure a reverse proxy.

## Evaluation

- Metrics are fixture-based classification precision/recall approximations.
- Lexical grounding is a safeguard against unsupported answers, not a full NLI model.
- Not a substitute for production monitoring or human review.

## Web dashboard

- Minimal Vite static UI for upload, list, ask (with citations), and metrics.
- No authentication in the web app (relies on API token if configured).
