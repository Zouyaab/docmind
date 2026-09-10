import { describe, expect, it } from "vitest";
import { bandFromScore } from "./confidence.js";

describe("bandFromScore", () => {
  it("returns HIGH_CONFIDENCE at or above default high threshold", () => {
    expect(bandFromScore(0.85)).toBe("HIGH_CONFIDENCE");
    expect(bandFromScore(1)).toBe("HIGH_CONFIDENCE");
  });

  it("returns REVIEW_REQUIRED between review and high thresholds", () => {
    expect(bandFromScore(0.6)).toBe("REVIEW_REQUIRED");
    expect(bandFromScore(0.84)).toBe("REVIEW_REQUIRED");
  });

  it("returns LOW_CONFIDENCE below review threshold", () => {
    expect(bandFromScore(0.59)).toBe("LOW_CONFIDENCE");
    expect(bandFromScore(0)).toBe("LOW_CONFIDENCE");
  });

  it("respects custom thresholds", () => {
    expect(bandFromScore(0.9, { high: 0.95, review: 0.7 })).toBe("REVIEW_REQUIRED");
    expect(bandFromScore(0.96, { high: 0.95, review: 0.7 })).toBe("HIGH_CONFIDENCE");
  });

  it("rejects invalid scores", () => {
    expect(() => bandFromScore(-0.1)).toThrow(RangeError);
    expect(() => bandFromScore(1.1)).toThrow(RangeError);
    expect(() => bandFromScore(Number.NaN)).toThrow(RangeError);
  });

  it("rejects invalid threshold ordering", () => {
    expect(() => bandFromScore(0.5, { high: 0.5, review: 0.6 })).toThrow(RangeError);
  });
});
