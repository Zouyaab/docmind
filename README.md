# DocMind

Local-first **AI Document Intelligence & Decision Engine**.

DocMind ingests documents, extracts and chunks text, classifies document type, embeds content for semantic search, answers questions with citations, and applies deterministic decision rules.

## Quick start

```bash
pnpm install
pnpm build
pnpm test
pnpm dev          # API on http://127.0.0.1:3000
pnpm dev:web      # Dashboard on http://127.0.0.1:5173
```

## Architecture

```text
Ingest → Extract/Chunk → Classify → Embed → Search → RAG → Decisions
```

See [docs/architecture.md](docs/architecture.md) for details.

## API

REST API at `/api/v1/*`. OpenAPI UI at `/docs` when the API is running.

See [docs/api.md](docs/api.md).

## Configuration

Copy `.env.example` to `.env`. Key variables:

| Variable           | Default    | Description           |
| ------------------ | ---------- | --------------------- |
| `API_PORT`         | `3000`     | API listen port       |
| `API_TOKEN`        | —          | Optional Bearer token |
| `MAX_UPLOAD_BYTES` | `10485760` | Upload size limit     |

## Docker

```bash
docker compose -f docker/docker-compose.yml up --build
```

## License

MIT — see [LICENSE](LICENSE).
