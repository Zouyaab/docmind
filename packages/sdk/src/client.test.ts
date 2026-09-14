import { describe, expect, it, vi } from "vitest";
import { DocMindError } from "@docmind/core";
import { DocMindClient } from "./client.js";

describe("DocMindClient", () => {
  it("calls health endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    const client = new DocMindClient({ baseUrl: "http://localhost:3000", fetchImpl });
    const result = await client.health();
    expect(result.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/health",
      expect.objectContaining({ headers: {} }),
    );
  });

  it("sends bearer token when configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "DocMind", version: "0.3.0" }),
    });
    const client = new DocMindClient({
      baseUrl: "http://localhost:3000",
      token: "secret",
      fetchImpl,
    });
    await client.version();
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
  });

  it("maps abort to TIMEOUT DocMindError", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const client = new DocMindClient({
      baseUrl: "http://localhost:3000",
      timeoutMs: 5,
      fetchImpl,
    });
    await expect(client.health()).rejects.toMatchObject({
      code: "TIMEOUT",
      statusCode: 408,
    } satisfies Partial<DocMindError>);
  });

  it("parses API error payloads", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ error: { code: "NOT_FOUND", message: "missing" } }),
    });
    const client = new DocMindClient({ baseUrl: "http://localhost:3000", fetchImpl });
    await expect(client.getDocument("x")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "missing",
      statusCode: 404,
    });
  });
});
