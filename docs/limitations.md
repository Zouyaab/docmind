# DocMind MVP Limitations

This MVP is designed for **offline, local development and evaluation**. Known limitations:

## Extraction

- PDF parsing uses a heuristic stream extractor, not a production PDF library.
- Scanned PDFs and complex layouts are not supported.

## AI providers

- Default runtime uses **mock** LLM and embedding providers.
- Ollama providers exist but are not used in CI tests.
- No cloud LLM integrations in this MVP.

## Storage

- Document metadata and vectors are in-memory by default.
- Blob storage uses local filesystem under `.data/blobs`.
- Postgres/pgvector is noted in Docker compose but not wired in MVP.

## Security

- Prompt injection guards are basic pattern matching.
- No user accounts, RBAC, or encryption at rest.
- Optional single shared API token only.

## Evaluation

- Metrics are fixture-based classification precision/recall approximations.
- Not a substitute for production monitoring or human review.

## Web dashboard

- Minimal Vite static UI for upload, list, ask, and metrics.
- No authentication in the web app (relies on API token if configured).
