# Changelog

All notable changes to this project are documented in this file.

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
