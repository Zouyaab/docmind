# Changelog

All notable changes to this project are documented in this file.

## [0.2.0] - 2026-09-11

### Added

- `@docmind/persistence` with memory + PostgreSQL/pgvector stores
- Schema migrations for documents, chunks, embeddings, classifications, fields, decisions
- Configurable AI/embedding providers (`mock` | `ollama`) with timeouts/retries
- Improved PDF extraction (Tj/hex/stream + scanned/image detection)
- RAG insufficient-evidence handling, retrieved-chunk injection sanitization, and lexical answer grounding
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
