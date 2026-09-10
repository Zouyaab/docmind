import type { Evidence } from "@docmind/core";

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH";
export type DecisionOutcome = "ALLOW" | "REVIEW_REQUIRED" | "REJECT";

export type FieldValue = string | number | boolean | null;

export interface DecisionFacts {
  documentType?: string;
  fields: Record<string, FieldValue>;
  metadata?: Record<string, FieldValue>;
}

export type ConditionOperator =
  "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "exists" | "missing" | "includes";

export interface RuleCondition {
  path: string;
  op: ConditionOperator;
  value?: FieldValue;
}

export interface DecisionRule {
  id: string;
  title: string;
  severity: Severity;
  explanation: string;
  conditions: RuleCondition[];
  /** Points added to risk score when rule fires (0-100 contribution before cap). */
  points: number;
  /** Outcome hint when this rule fires. */
  outcome?: DecisionOutcome;
}

export interface TriggeredRisk {
  rule: string;
  title: string;
  severity: Severity;
  explanation: string;
  points: number;
  evidence: Evidence[];
}

export interface DecisionResult {
  decision: DecisionOutcome;
  riskScore: number;
  risks: TriggeredRisk[];
  rulesEvaluated: number;
  note: string;
}

export const DECISION_NOTE =
  "Deterministic rules only. LLM extraction may feed facts, but decisions are not LLM judgments.";
