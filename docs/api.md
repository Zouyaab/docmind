# DocMind API

Base URL: `http://127.0.0.1:3000/api/v1`

Optional auth: `Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is set.

## Endpoints

| Method | Path                     | Description                             |
| ------ | ------------------------ | --------------------------------------- |
| GET    | `/health`                | Health check                            |
| GET    | `/version`               | Product name and version                |
| POST   | `/documents`             | Upload document (multipart or raw text) |
| GET    | `/documents`             | List documents                          |
| GET    | `/documents/:id`         | Get document metadata                   |
| POST   | `/documents/:id/process` | Extract, chunk, classify, embed         |
| POST   | `/search`                | Semantic search `{ query, topK? }`      |
| POST   | `/ask`                   | RAG Q&A `{ query, topK? }`              |
| POST   | `/decide`                | Deterministic decision `{ documentId }` |
| GET    | `/metrics`               | Counters and latency snapshots          |

## Example

```bash
curl -X POST http://127.0.0.1:3000/api/v1/documents \
  -H "Content-Type: text/plain" \
  --data "Invoice total due $500"

curl -X POST http://127.0.0.1:3000/api/v1/documents/{id}/process

curl -X POST http://127.0.0.1:3000/api/v1/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the total due?"}'
```

OpenAPI UI: `http://127.0.0.1:3000/docs`
