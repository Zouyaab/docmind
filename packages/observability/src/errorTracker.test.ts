import { describe, expect, it } from "vitest";
import { DocMindError } from "@docmind/core";
import { createErrorTracker } from "./errorTracker.js";

describe("createErrorTracker", () => {
  it("tracks errors with timestamp", () => {
    const tracker = createErrorTracker();
    const tracked = tracker.track(new Error("something failed"));

    expect(tracked.message).toBe("something failed");
    expect(tracked.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(tracker.list()).toHaveLength(1);
  });

  it("captures DocMindError code", () => {
    const tracker = createErrorTracker();
    const tracked = tracker.track(new DocMindError("NOT_FOUND", "missing"));
    expect(tracked.code).toBe("NOT_FOUND");
  });

  it("redacts secrets in messages and context", () => {
    const tracker = createErrorTracker();
    const tracked = tracker.track(new Error("Bearer abc123token"), {
      apiToken: "super-secret",
      authorization: "Bearer xyz",
      safe: "visible",
    });

    expect(tracked.message).toContain("[REDACTED]");
    expect(tracked.message).not.toContain("abc123token");
    expect(tracked.context).toEqual({
      apiToken: "[REDACTED]",
      authorization: "[REDACTED]",
      safe: "visible",
    });
  });

  it("clears tracked errors", () => {
    const tracker = createErrorTracker();
    tracker.track(new Error("one"));
    tracker.clear();
    expect(tracker.list()).toHaveLength(0);
  });
});
