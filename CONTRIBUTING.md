# Contributing

Thanks for helping improve DocMind.

## Development setup

```bash
pnpm bootstrap
```

Or manually:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

`pnpm bootstrap` is the supported fresh-clone path: frozen install, build, and offline tests
with mock AI and no PostgreSQL.

## Workflow

1. Create a focused branch.
2. Prefer small, reviewable commits that group implementation + tests.
3. Run before opening a PR:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm audit:prod
```

## Guidelines

- Keep tests offline by default (Mock providers; no `DATABASE_URL` / Ollama required).
- Postgres integration tests live in `*.integration.test.ts` and are excluded unless you run them explicitly with `DATABASE_URL`.
- Ollama suites use `*.ollama.test.ts` and are excluded by default.
- Do not add Terraform/K8s unless the product genuinely needs it.
- Do not log document contents, tokens, or secrets.
- Document behavior changes in `CHANGELOG.md`.
- Preserve the separation between LLM interpretation and deterministic decision rules.
