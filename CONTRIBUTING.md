# Contributing

Thanks for helping improve DocMind.

## Development setup

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

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

- Keep tests offline by default (Mock providers).
- Do not add Terraform/K8s unless the product genuinely needs it.
- Do not log document contents, tokens, or secrets.
- Document behavior changes in `CHANGELOG.md`.
- Preserve the separation between LLM interpretation and deterministic decision rules.
