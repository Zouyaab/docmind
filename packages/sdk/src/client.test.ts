import { describe, expect, it, vi } from "vitest";
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
      json: async () => ({ name: "DocMind", version: "0.1.0" }),
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
});
