export interface CounterSnapshot {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export interface LatencySnapshot {
  name: string;
  labels: Record<string, string>;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

function labelKey(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join("|");
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly latencies = new Map<
    string,
    { count: number; totalMs: number; minMs: number; maxMs: number }
  >();

  increment(name: string, labels: Record<string, string> = {}, amount = 1): void {
    const key = `${name}::${labelKey(labels)}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }

  observeLatency(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError("durationMs must be a non-negative finite number");
    }

    const key = `${name}::${labelKey(labels)}`;
    const existing = this.latencies.get(key);

    if (!existing) {
      this.latencies.set(key, {
        count: 1,
        totalMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
      });
      return;
    }

    existing.count += 1;
    existing.totalMs += durationMs;
    existing.minMs = Math.min(existing.minMs, durationMs);
    existing.maxMs = Math.max(existing.maxMs, durationMs);
  }

  getCounter(name: string, labels: Record<string, string> = {}): number {
    return this.counters.get(`${name}::${labelKey(labels)}`) ?? 0;
  }

  getLatency(name: string, labels: Record<string, string> = {}): LatencySnapshot | undefined {
    const key = `${name}::${labelKey(labels)}`;
    const stats = this.latencies.get(key);
    if (!stats) {
      return undefined;
    }

    return {
      name,
      labels,
      count: stats.count,
      totalMs: stats.totalMs,
      minMs: stats.minMs,
      maxMs: stats.maxMs,
      avgMs: stats.totalMs / stats.count,
    };
  }

  snapshotCounters(): CounterSnapshot[] {
    const results: CounterSnapshot[] = [];

    for (const [key, value] of this.counters.entries()) {
      const [name, labelPart] = key.split("::");
      results.push({
        name: name ?? key,
        labels: parseLabelKey(labelPart ?? ""),
        value,
      });
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  snapshotLatencies(): LatencySnapshot[] {
    const results: LatencySnapshot[] = [];

    for (const key of this.latencies.keys()) {
      const [name, labelPart] = key.split("::");
      const snapshot = this.getLatency(name ?? key, parseLabelKey(labelPart ?? ""));
      if (snapshot) {
        results.push(snapshot);
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  reset(): void {
    this.counters.clear();
    this.latencies.clear();
  }
}

function parseLabelKey(labelPart: string): Record<string, string> {
  if (!labelPart) {
    return {};
  }

  const labels: Record<string, string> = {};
  for (const segment of labelPart.split("|")) {
    const [key, value] = segment.split("=");
    if (key && value !== undefined) {
      labels[key] = value;
    }
  }
  return labels;
}
