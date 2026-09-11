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

- Secure document upload (MIME sniffing, size limits, path-safe blob storage)
- Text extraction + chunking with offsets/provenance
- Heuristic + LLM-assisted classification (Mock by default; Ollama optional)
- In-memory vector search (Postgres/pgvector reserved for later)
- Citation-aware Q&A with prompt-injection defenses
- Deterministic risk/decision rules (separate from LLM interpretation)
- Fastify OpenAPI (`/docs`), metrics endpoint, structured JSON logs
- Offline CI (no internet / Ollama required for tests)

## Architecture

```text
Ingest → Extract/Chunk → Classify → Embed → Search → RAG → Decision Engine
```

LLM providers **interpret**. The decision engine applies **deterministic rules**. Evidence/provenance travels with results.

See [docs/architecture.md](docs/architecture.md).

## Repository structure

| Path         | Role                             |
| ------------ | -------------------------------- |
| `apps/api`   | Fastify API                      |
| `apps/web`   | Local dashboard                  |
| `packages/*` | Core libraries                   |
| `docker/`    | Dockerfile + Compose             |
| `tests/`     | Offline e2e + fixtures           |
| `docs/`      | Architecture / API / limitations |

## Requirements

- Node.js ≥ 20
- pnpm 11.22.0 (via Corepack)
- Docker (optional, for Compose)

## Installation

```bash
git clone https://github.com/Zouyaab/docmind.git
cd docmind
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## Environment variables

Copy [`.env.example`](.env.example) to `.env`. Every variable used by the config loader is documented there.

Notable:

| Variable                | Required      | Purpose                      |
| ----------------------- | ------------- | ---------------------------- |
| `API_HOST` / `API_PORT` | No (defaults) | Bind address                 |
| `MAX_UPLOAD_BYTES`      | No            | Upload cap                   |
| `LOG_LEVEL`             | No            | Structured log level         |
| `API_TOKEN`             | No            | Bearer auth when non-empty   |
| `OLLAMA_*`              | No            | Optional live model endpoint |
| `DATABASE_URL`          | No            | Reserved for future Postgres |

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

## Docker

From the repository root (recommended):

```bash
docker compose -f docker/docker-compose.yml up --build
```

Equivalent root entrypoint (for tooling that expects a root Compose file):

```bash
docker compose -f compose.yml up --build
```

Then:

```bash
curl http://127.0.0.1:3000/api/v1/health
```

Optional profiles:

```bash
# Postgres reserved for future pgvector (not used by MVP API yet)
docker compose -f docker/docker-compose.yml --profile postgres up --build

# Local Ollama network peer (API still defaults to Mock providers in-process)
docker compose -f docker/docker-compose.yml --profile ollama up --build
```

## Testing & coverage

```bash
pnpm test
pnpm test:coverage   # enforces Vitest thresholds (lines/statements/functions ≥70%, branches ≥65%)
```

Default tests are **offline** (Mock LLM/embeddings). Ollama-marked suites are opt-in (`*.ollama.test.ts`, excluded by default).

## API / CLI / SDK

- API docs: [docs/api.md](docs/api.md) and interactive `/docs`
- CLI: `pnpm cli -- health`
- SDK: `@docmind/sdk` `DocMindClient`

## Security & privacy

- Document bytes are untrusted; prompts wrap them as data, not instructions
- Optional `API_TOKEN` Bearer auth
- Helmet security headers + rate limiting
- Secrets redacted in error tracking
- See [SECURITY.md](SECURITY.md)

## Persistence

| Mode | When | Behavior |
| --- | --- | --- |
| Memory | `DATABASE_URL` unset (CI/tests default) | In-process stores |
| PostgreSQL + pgvector | `DATABASE_URL` set | Durable documents, chunks, embeddings, classifications, fields, decisions |

`createStores()` in `@docmind/persistence` selects the backend. Compose defaults to `pgvector/pgvector:pg16`.

## Observability

- Structured Pino logs via Fastify (`requestId`, method, url, statusCode, responseTime)
- In-process metrics at `GET /api/v1/metrics`
- Error tracker captures failures with redaction (no client stack leaks)

## Troubleshooting

| Symptom                   | Fix                                                           |
| ------------------------- | ------------------------------------------------------------- |
| `pnpm` blocked on Windows | Use `pnpm.cmd` or `Set-ExecutionPolicy -Scope Process Bypass` |
| Path with spaces fails    | Quote: `Set-Location "C:\Users\...\docmind"`                  |
| Auth 401s unexpectedly    | Clear `API_TOKEN` or send `Authorization: Bearer …`           |
| Compose build fails       | Ensure Docker Desktop is running; use Node 20 base image      |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — [LICENSE](LICENSE)

## Roadmap

- Wire Postgres/pgvector for durable retrieval
- Production PDF parser (current heuristic is MVP)
- Optional Ollama provider selection via env (without changing offline CI)
- Stronger multi-tenant auth / quotas

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
