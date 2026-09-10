import { describe, expect, it } from "vitest";
import { MetricsRegistry } from "./metrics.js";

describe("MetricsRegistry", () => {
  it("increments counters with labels", () => {
    const metrics = new MetricsRegistry();
    metrics.increment("uploads_total");
    metrics.increment("uploads_total", { status: "ok" });
    metrics.increment("uploads_total", { status: "ok" }, 2);

    expect(metrics.getCounter("uploads_total")).toBe(1);
    expect(metrics.getCounter("uploads_total", { status: "ok" })).toBe(3);
  });

  it("records latency statistics", () => {
    const metrics = new MetricsRegistry();
    metrics.observeLatency("extract_ms", 10, { mime: "text/plain" });
    metrics.observeLatency("extract_ms", 30, { mime: "text/plain" });

    const snapshot = metrics.getLatency("extract_ms", { mime: "text/plain" });
    expect(snapshot).toMatchObject({
      count: 2,
      totalMs: 40,
      minMs: 10,
      maxMs: 30,
      avgMs: 20,
    });
  });

  it("snapshots counters and latencies", () => {
    const metrics = new MetricsRegistry();
    metrics.increment("jobs_total", { stage: "ingest" });
    metrics.observeLatency("job_ms", 5);

    expect(metrics.snapshotCounters()).toHaveLength(1);
    expect(metrics.snapshotLatencies()).toHaveLength(1);
  });

  it("rejects invalid latency values", () => {
    const metrics = new MetricsRegistry();
    expect(() => metrics.observeLatency("bad", -1)).toThrow(RangeError);
  });
});
