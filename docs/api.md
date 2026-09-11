# DocMind API

Base URL: `http://127.0.0.1:3000/api/v1`

Optional auth: `Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is set.

Public (unauthenticated) routes: `/health`, `/ready`, `/version`, and `/docs`.

## Endpoints

| Method | Path                     | Description                                        |
| ------ | ------------------------ | -------------------------------------------------- |
| GET    | `/health`                | Liveness + persistence/DB status                   |
| GET    | `/ready`                 | Readiness (`ready: false` → HTTP 503)              |
| GET    | `/version`               | Product name and version                           |
| POST   | `/documents`             | Upload → `{ document, duplicate }`                 |
| GET    | `/documents`             | List documents                                     |
| GET    | `/documents/:id`         | Get document metadata                              |
| POST   | `/documents/:id/process` | Extract, chunk, classify, embed                    |
| POST   | `/search`                | Semantic search `{ query, topK?, documentId? }`    |
| POST   | `/ask`                   | RAG Q&A `{ query, topK?, documentId?, minScore? }` |
| POST   | `/decide`                | Deterministic decision `{ documentId }`            |
| GET    | `/metrics`               | Counters and latency snapshots                     |

Errors use a consistent shape:

```json
{ "error": { "code": "NOT_FOUND", "message": "Document not found" } }
```

## Example

```bash
curl -X POST http://127.0.0.1:3000/api/v1/documents \
  -H "Content-Type: text/plain" \
  --data "Invoice total due $500"

# Response includes { "document": { "id": "..." }, "duplicate": false }

curl -X POST http://127.0.0.1:3000/api/v1/documents/{id}/process

curl -X POST http://127.0.0.1:3000/api/v1/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the total due?"}'
```

OpenAPI UI: `http://127.0.0.1:3000/docs`  
OpenAPI JSON: `http://127.0.0.1:3000/docs/json`
