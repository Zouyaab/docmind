import { describe, expect, it, vi } from "vitest";
import { createErrorTracker } from "./errorTracker.js";
import { createSafeErrorSink, createWebhookErrorSink } from "./sinks.js";

describe("error sinks", () => {
  it("posts redacted payloads to a webhook endpoint", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: String(init?.body ?? ""),
      });
      return new Response(null, { status: 204 });
    });

    const tracker = createErrorTracker({
      sinks: [
        createWebhookErrorSink({
          url: "https://errors.example/ingest",
          headers: { "x-provider": "sentry-compatible" },
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }),
      ],
    });

    tracker.track(new Error("Bearer secret-token failed"), {
      password: "hunter2",
      text: "full document body should not ship",
      requestId: "req-1",
    });

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toBe("https://errors.example/ingest");
    const payload = JSON.parse(calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(payload.source).toBe("docmind");
    expect(payload.level).toBe("error");
    expect(String(payload.message)).toContain("[REDACTED]");
    expect(String(payload.message)).not.toContain("secret-token");
    expect(payload.context).toMatchObject({
      password: "[REDACTED]",
      text: "[REDACTED_CONTENT]",
      requestId: "req-1",
    });
    expect(JSON.stringify(payload)).not.toMatch(/hunter2|document body/i);
  });

  it("never throws when the webhook provider fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const sink = createWebhookErrorSink({
      url: "https://errors.example/ingest",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const tracker = createErrorTracker({ sinks: [sink] });

    expect(() => tracker.track(new Error("boom"))).not.toThrow();
    await Promise.resolve();
    expect(tracker.list()).toHaveLength(1);
  });

  it("isolates synchronous sink exceptions", () => {
    const sink = createSafeErrorSink(() => {
      throw new Error("sink exploded");
    });
    const tracker = createErrorTracker({ sinks: [sink] });
    expect(() => tracker.track(new Error("app error"))).not.toThrow();
    expect(tracker.list()[0]?.message).toBe("app error");
  });
});
