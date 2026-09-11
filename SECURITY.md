# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please open a private security advisory on GitHub or email the maintainer via the GitHub profile contact options. Do not file public issues that include exploit details for unpatched flaws.

## Security model (current)

- **Local-first defaults**: Mock LLM/embeddings in tests and CI; no cloud AI credentials required.
- **Optional API auth**: set `API_TOKEN` to require Bearer tokens on non-public routes.
- **Upload hardening**: size limits, MIME detection, safe filenames, path-traversal-safe blob store.
- **AI boundary**: document content is treated as untrusted data; prompt-injection patterns are blocked or sandboxed.
- **Logging**: authorization headers and known secret patterns are redacted; unexpected errors return generic client messages.
- **HTTP hardening**: Helmet headers and basic rate limiting are enabled on the API.

## Out of scope (today)

- Multi-tenant authorization / SSO
- Durable encrypted-at-rest document store
- Production OCR / PDF malware scanning
