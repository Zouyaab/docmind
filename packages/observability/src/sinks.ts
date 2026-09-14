import type { ErrorSink, TrackedError } from "./errorTracker.js";

export interface WebhookErrorSinkOptions {
  /** HTTPS endpoint that accepts a JSON TrackedError body (Sentry-compatible collectors welcome). */
  url: string;
  /** Optional static headers (never log these). */
  headers?: Record<string, string>;
  /** Injected for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms (default 3000). */
  timeoutMs?: number;
}

/**
 * Optional HTTP error sink. Failures are swallowed — reporting must never crash the app.
 * Callers must only pass already-redacted TrackedError payloads (ErrorTracker does this).
 */
export function createWebhookErrorSink(options: WebhookErrorSinkOptions): ErrorSink {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3_000;

  return async (error: TrackedError): Promise<void> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await fetchImpl(options.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options.headers ?? {}),
          },
          body: JSON.stringify({
            source: "docmind",
            level: "error",
            ...error,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Intentionally empty: sink failures must not affect request handling.
    }
  };
}

/** Wrap any sink so synchronous throws cannot escape track(). */
export function createSafeErrorSink(sink: ErrorSink): ErrorSink {
  return (error) => {
    try {
      const result = sink(error);
      if (result && typeof (result as Promise<void>).then === "function") {
        return Promise.resolve(result).catch(() => undefined);
      }
      return result;
    } catch {
      return undefined;
    }
  };
}
