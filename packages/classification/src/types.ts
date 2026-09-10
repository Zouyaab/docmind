import type { ConfidenceBand, Evidence } from "@docmind/core";

export type DocumentType = "invoice" | "contract" | "report" | "resume" | "unknown";

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  band: ConfidenceBand;
  evidence: Evidence[];
}
