import { describe, expect, it, afterEach } from "vitest";
import { buildServer } from "./server.js";

describe("DocMind API", () => {
  let app: Awaited<ReturnType<typeof buildServer>>["app"];

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("returns health and version", async () => {
    ({ app } = await buildServer());
    const health = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });

    const version = await app.inject({ method: "GET", url: "/api/v1/version" });
    expect(version.json()).toMatchObject({ name: "DocMind", version: "0.1.0" });
  });

  it("uploads, processes, searches, asks, and decides", async () => {
    ({ app } = await buildServer());
    const text = `SERVICE AGREEMENT
Company: Acme Corp
Expiration Date: 2027-06-01
Auto-renewal: true
Notice period: 14 days
Contract value: $150,000`;

    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/documents",
      headers: { "content-type": "text/plain" },
      payload: text,
    });
    expect(upload.statusCode).toBe(200);
    const doc = upload.json() as { id: string };

    const process = await app.inject({
      method: "POST",
      url: `/api/v1/documents/${doc.id}/process`,
    });
    expect(process.statusCode).toBe(200);
    expect(process.json().classification.documentType).toBe("contract");

    const search = await app.inject({
      method: "POST",
      url: "/api/v1/search",
      payload: { query: "notice period", topK: 3 },
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().results.length).toBeGreaterThan(0);

    const ask = await app.inject({
      method: "POST",
      url: "/api/v1/ask",
      payload: { query: "What is the notice period?" },
    });
    expect(ask.statusCode).toBe(200);
    expect(ask.json().answer).toBeTruthy();

    const decide = await app.inject({
      method: "POST",
      url: "/api/v1/decide",
      payload: { documentId: doc.id },
    });
    expect(decide.statusCode).toBe(200);
    expect(decide.json().decision).toBe("REVIEW_REQUIRED");
  });
});
