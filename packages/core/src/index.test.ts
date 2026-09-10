import { describe, expect, it } from "vitest";
import { bandFromScore } from "./confidence.js";
import { DocMindError } from "./errors.js";
import { createId, sha256Hex } from "./id.js";

describe("core", () => {
  it("creates unique ids and stable hashes", () => {
    expect(createId()).not.toEqual(createId());
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
  });

  it("maps confidence bands", () => {
    expect(bandFromScore(0.9)).toBe("HIGH_CONFIDENCE");
    expect(bandFromScore(0.7)).toBe("REVIEW_REQUIRED");
    expect(bandFromScore(0.2)).toBe("LOW_CONFIDENCE");
  });

  it("carries error codes", () => {
    const err = new DocMindError("INVALID_DOCUMENT", "bad", 422);
    expect(err.code).toBe("INVALID_DOCUMENT");
    expect(err.statusCode).toBe(422);
  });
});
