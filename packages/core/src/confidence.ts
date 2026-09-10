import type { ConfidenceBand } from "./types.js";

export interface ConfidenceThresholds {
  high: number;
  review: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  high: 0.85,
  review: 0.6,
};

export function bandFromScore(
  score: number,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceBand {
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new RangeError("score must be a finite number between 0 and 1");
  }
  if (thresholds.high <= thresholds.review) {
    throw new RangeError("high threshold must be greater than review threshold");
  }

  if (score >= thresholds.high) {
    return "HIGH_CONFIDENCE";
  }
  if (score >= thresholds.review) {
    return "REVIEW_REQUIRED";
  }
  return "LOW_CONFIDENCE";
}
