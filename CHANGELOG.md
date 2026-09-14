# Changelog

All notable changes to this project are documented in this file.

## [0.3.1] - 2026-09-14

### Added

- Configurable pgvector embedding dimensions via `EMBEDDING_DIMENSIONS` (first migration + empty-table resize)
- Postgres integration coverage for ranking order, cross-pool retrieval, and dimension resize

### Fixed

- API process handles SIGTERM/SIGINT and closes the Postgres pool via Fastify `onClose`
- Docker image HEALTHCHECK probes `/api/v1/ready` so DB outages are not reported as healthy
- Vector search surfaces a database error when both SQL and fallback paths fail

### Changed

- Docs clarify dimension changes with existing vectors fail until embeddings are cleared

## [0.3.0] - 2026-09-14

### Added

- Modular API route modules (`documents`, `search`, `ask`, `decide`, `ops`) separated from server bootstrap
- `pnpm bootstrap` offline fresh-clone validation (frozen install, build, mock AI, no Postgres required)
- Explicit Postgres integration suite (`pnpm test:integration`) with skip-when-unavailable behavior
- Docker Compose ephemeral pgvector service + `pnpm test:integration:docker` runner and CI integration job
- Optional webhook error sink (`ERROR_SINK_URL`) with content redaction and fail-safe delivery
- Page-aware document chunking / provenance for PDF and multi-page text
- RAG citation validation (`citationValidated`) and numeric conflicting-evidence detection (`conflicts`)

### Changed

- Workspace packages declare only dependencies they directly import (no accidental hoisting reliance)
- Ask OpenAPI response documents `citationValidated` and `conflicts`
- ESLint recognizes Node globals for `scripts/` and `.tools/`

### Documentation

- Architecture notes for dependency layout, provenance, citation validation, and error sinks
- README bootstrap / offline vs integration test categories

## [0.2.0] - 2026-09-11

### Added

- `@docmind/persistence` with memory + PostgreSQL/pgvector stores
- Schema migrations for documents, chunks, embeddings, classifications, fields, decisions
- Configurable AI/embedding providers (`mock` | `ollama`) with timeouts/retries
- Improved PDF extraction (Tj/hex/stream + scanned/image detection)
- RAG insufficient-evidence handling, retrieved-chunk injection sanitization, and lexical answer grounding
- Decision risks attach chunk provenance via `buildEvidenceByField`
- Vector search filters (`documentId`, `minScore`)
- Health + readiness endpoints (`/api/v1/health`, `/api/v1/ready`) with persistence/DB status
- Upload responses include `{ document, duplicate }`
- SDK request timeouts and structured network/timeout errors
- CLI `ready` command, predictable exit codes, and unit tests
- Web dashboard loading/error/empty states and citation rendering
- OpenAPI route schemas + contract coverage for documented paths
- Error tracker `ErrorSink` extension point
- Split CI jobs (lint, typecheck, test, build/audit/compose)
- Configurable `RATE_LIMIT_MAX`

### Changed

- Docker Compose defaults to API + pgvector Postgres; API healthcheck uses `/ready`
- Decision results persisted when using stores
- Documentation aligned with wired Postgres persistence (limitations, README, architecture)

## [0.1.1] - 2026-09-11

### Added

- Root `compose.yml` include entry for Compose discovery
- Dependabot configuration for npm and GitHub Actions
- CI production dependency audit gate (`pnpm audit:prod`)
- Fastify Helmet + rate limiting
- Explicit structured request logging fields and error tracker integration
- SECURITY.md, CONTRIBUTING.md, expanded README project-type documentation

### Fixed

- Bearer auth hook now halts unauthorized requests
- `.env.example` documents `API_TOKEN` and all config variables
- Docker Compose health checks and optional Ollama/Postgres profiles
- Pipeline LLM field extraction uses the message-based provider API
- Coverage branch threshold raised to 65%

## [0.1.0] - 2026-09-10

### Added

- Initial DocMind MVP monorepo (API, CLI, SDK, RAG, decision engine, tests, CI)
