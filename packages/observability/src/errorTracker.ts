import { DocMindError } from "@docmind/core";

export interface TrackedError {
  timestamp: string;
  message: string;
  code?: string;
  stack?: string;
  context?: Record<string, unknown>;
}

/** Optional external sink (Sentry, Datadog, etc.) for production deployments. */
export type ErrorSink = (error: TrackedError) => void | Promise<void>;

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /api[_-]?token[=:\s]+[^\s,;]+/gi,
  /password[=:\s]+[^\s,;]+/gi,
  /postgres(?:ql)?:\/\/[^@\s]+@[^\s]+/gi,
  /sk-[A-Za-z0-9]{20,}/g,
];

function redactString(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/token|secret|password|authorization|api[_-]?key/i.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactValue(nested);
      }
    }
    return result;
  }
  return value;
}

export interface ErrorTracker {
  track(error: unknown, context?: Record<string, unknown>): TrackedError;
  list(): TrackedError[];
  clear(): void;
  addSink(sink: ErrorSink): void;
}

export function createErrorTracker(options: { sinks?: ErrorSink[] } = {}): ErrorTracker {
  const errors: TrackedError[] = [];
  const sinks: ErrorSink[] = [...(options.sinks ?? [])];

  return {
    addSink(sink: ErrorSink): void {
      sinks.push(sink);
    },

    track(error: unknown, context?: Record<string, unknown>): TrackedError {
      const message =
        error instanceof Error ? redactString(error.message) : redactString(String(error));
      const stack = error instanceof Error && error.stack ? redactString(error.stack) : undefined;

      const tracked: TrackedError = {
        timestamp: new Date().toISOString(),
        message,
      };

      if (context) {
        tracked.context = redactValue(context) as Record<string, unknown>;
      }

      if (DocMindError.isDocMindError(error)) {
        tracked.code = error.code;
      }

      if (stack !== undefined) {
        tracked.stack = stack;
      }

      errors.push(tracked);
      for (const sink of sinks) {
        void Promise.resolve(sink(tracked)).catch(() => undefined);
      }
      return tracked;
    },

    list(): TrackedError[] {
      return [...errors];
    },

    clear(): void {
      errors.length = 0;
    },
  };
}

export { redactString as redactSecretsForTest };
