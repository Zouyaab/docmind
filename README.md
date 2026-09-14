# DocMind

Local-first **AI Document Intelligence & Decision Engine**.

DocMind turns unstructured documents into auditable structured outcomes through ingestion, extraction, classification, embeddings, retrieval, citation-aware RAG, and a **deterministic decision engine**.

## Project Type

DocMind is a **production-oriented application/backend TypeScript monorepo**.

It contains:

- HTTP API (`apps/api`)
- CLI (`packages/cli`)
- Typed SDK (`packages/sdk`)
- AI / document processing pipeline
- Retrieval + RAG
- Decision engine
- Observability (metrics + error tracking)
- Optional Vite dashboard (`apps/web`)

Infrastructure-as-code such as Terraform, Kubernetes, Helm, Pulumi, and Ansible is **intentionally out of scope** for this repository. Docker Compose here packages the **application**, not a cloud control plane.

## Features

- Secure document upload (MIME sniffing, size limits, path-safe blob storage, duplicate detection)
- Text extraction + chunking with offsets/provenance
- Heuristic + LLM-assisted classification (Mock by default; Ollama optional)
- In-memory vector search **or** PostgreSQL/pgvector when `DATABASE_URL` is set
- Citation-aware Q&A with prompt-injection defenses and answer grounding
- Deterministic risk/decision rules (separate from LLM interpretation)
- Fastify OpenAPI (`/docs`), readiness (`/api/v1/ready`), metrics, structured JSON logs
- Offline CI (no internet / Ollama / Postgres required for the default test suite)

## Architecture

```text
Ingest → Extract/Chunk → Classify → Embed → Search → RAG → Decision Engine
```

LLM providers **interpret**. The decision engine applies **deterministic rules**. Evidence/provenance travels with results.

See [docs/architecture.md](docs/architecture.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Repository structure

| Path         | Role                             |
| ------------ | -------------------------------- |
| `apps/api`   | Fastify API                      |
| `apps/web`   | Local Vite dashboard             |
| `packages/*` | Core libraries                   |
| `docker/`    | Dockerfile + Compose             |
| `tests/`     | Offline e2e + fixtures           |
| `docs/`      | Architecture / API / limitations |

## Requirements

- Node.js ≥ 20
- pnpm 11.22.0 (via Corepack)
- Docker (optional, for Compose + Postgres)

## Quick start (offline)

```bash
git clone https://github.com/Zouyaab/docmind.git
cd docmind
pnpm bootstrap
pnpm dev
# API: http://127.0.0.1:3000  OpenAPI: /docs  Ready: /api/v1/ready
```

`pnpm bootstrap` installs with a frozen lockfile, builds the workspace, and runs the
offline test suite. It clears `DATABASE_URL` for that run and forces `AI_PROVIDER=mock`,
so no cloud accounts, API keys, Ollama, or PostgreSQL are required.

Equivalent manual steps: `pnpm install --frozen-lockfile && pnpm build && pnpm test`.

## Environment variables

Copy [`.env.example`](.env.example) to `.env`. Every variable used by the config loader is documented there.

| Variable                | Required      | Purpose                                      |
| ----------------------- | ------------- | -------------------------------------------- |
| `API_HOST` / `API_PORT` | No (defaults) | Bind address                                 |
| `MAX_UPLOAD_BYTES`      | No            | Upload cap                                   |
| `LOG_LEVEL`             | No            | Structured log level                         |
| `API_TOKEN`             | No            | Bearer auth when non-empty                   |
| `DATABASE_URL`          | No            | Enable PostgreSQL + pgvector persistence     |
| `EMBEDDING_DIMENSIONS`  | No            | Must match DB schema (default `32`)          |
| `AI_PROVIDER`           | No            | `mock` (default) or `ollama`                 |
| `OLLAMA_*`              | No            | Optional live model endpoint                 |
| `RAG_MIN_SCORE`         | No            | Minimum retrieval score for RAG              |
| `RATE_LIMIT_MAX`        | No            | Requests per minute per client (default 120) |

## Local development

```bash
pnpm build
pnpm dev
# API: http://127.0.0.1:3000  OpenAPI: /docs

pnpm dev:web
# Dashboard: http://127.0.0.1:5173
```

Windows PowerShell (path spaces + execution policy):

```powershell
Set-Location "C:\Users\Zouyaab Hussain\docmind"
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd dev
```

## Docker (one command)

From the repository root:

```bash
docker compose -f docker/docker-compose.yml up --build
```

Equivalent root entrypoint:

```bash
docker compose -f compose.yml up --build
```

This starts:

- **API** (waits for Postgres health, exposes readiness on `/api/v1/ready`)
- **PostgreSQL + pgvector** with a persistent volume

Then:

```bash
curl.exe http://127.0.0.1:3000/api/v1/ready
curl.exe http://127.0.0.1:3000/api/v1/health
```

Optional Ollama peer (API still defaults to mock providers unless you set `AI_PROVIDER=ollama`):

```bash
docker compose -f docker/docker-compose.yml --profile ollama up --build
```

## Testing

DocMind separates three test categories:

| Category                   | Command                                               | External services                |
| -------------------------- | ----------------------------------------------------- | -------------------------------- |
| **Offline (default)**      | `pnpm test` / `pnpm test:coverage`                    | None — mock AI, in-memory stores |
| **PostgreSQL integration** | `pnpm test:integration:docker`                        | Ephemeral Postgres/pgvector      |
| **Ollama / live AI**       | `pnpm test:integration` (picks up `*.ollama.test.ts`) | Reachable Ollama endpoint        |

```bash
# Default offline suite (no DATABASE_URL / Ollama / API keys)
pnpm test
pnpm test:coverage

# Opt-in Postgres via ephemeral Docker (port 54329, torn down after)
pnpm test:integration:docker

# Opt-in integration config without Docker (explicit skip if DATABASE_URL unset)
pnpm test:integration
```

Default Vitest (`vitest.config.ts`) excludes `**/*.integration.test.ts` and `**/*.ollama.test.ts`.
When `DATABASE_URL` is set but PostgreSQL is down, integration tests **fail** — they do not
pretend to pass. CI runs the offline suite plus a dedicated `integration` job that starts
`docker/docker-compose.integration.yml`, applies migrations through the tests, and tears down.

## API / CLI / SDK

- API docs: [docs/api.md](docs/api.md) and interactive `/docs`
- CLI: `pnpm cli -- health` / `pnpm cli -- ready`
- SDK: `@docmind/sdk` `DocMindClient` (supports `timeoutMs`, Bearer token)

## Security & privacy

- Document bytes are untrusted; prompts wrap them as data, not instructions
- Optional `API_TOKEN` Bearer auth
- Helmet security headers + rate limiting
- Secrets redacted in error tracking; optional `ErrorSink` for external sinks
- See [SECURITY.md](SECURITY.md)

## Persistence

| Mode                  | When                 | Behavior                                                                  |
| --------------------- | -------------------- | ------------------------------------------------------------------------- |
| Memory                | `DATABASE_URL` unset | In-process stores (CI / default local)                                    |
| PostgreSQL + pgvector | `DATABASE_URL` set   | Durable documents, chunks, embeddings, classifications, fields, decisions |

Compose defaults to `pgvector/pgvector:pg16`.

## Observability

- Structured Pino logs via Fastify (`requestId`, method, url, statusCode, responseTime)
- In-process metrics at `GET /api/v1/metrics`
- Error tracker captures failures with redaction (no client stack leaks)
- Optional `ERROR_SINK_URL` webhook sink for production (redacted JSON; sink failures are ignored)
- Custom sinks can be registered via `ErrorTracker.addSink` / `createWebhookErrorSink`

## Troubleshooting

| Symptom                   | Fix                                                           |
| ------------------------- | ------------------------------------------------------------- |
| `pnpm` blocked on Windows | Use `pnpm.cmd` or `Set-ExecutionPolicy -Scope Process Bypass` |
| Path with spaces fails    | Quote: `Set-Location "C:\Users\...\docmind"`                  |
| Auth 401s unexpectedly    | Clear `API_TOKEN` or send `Authorization: Bearer …`           |
| Compose build fails       | Ensure Docker Desktop is running; use Node 20 base image      |
| Health ok but not ready   | Postgres unreachable — check `DATABASE_URL` / Compose logs    |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — [LICENSE](LICENSE)

## Roadmap

- Production PDF parser (current heuristic is MVP)
- Configurable pgvector dimensions beyond the default mock size (32)
- Stronger multi-tenant auth / quotas
- Optional external metrics sink (OpenTelemetry)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
