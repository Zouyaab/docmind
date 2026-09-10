import type { Evidence } from "@docmind/core";
import { evaluateCondition } from "./evaluate-condition.js";
import {
  DECISION_NOTE,
  type DecisionFacts,
  type DecisionOutcome,
  type DecisionResult,
  type DecisionRule,
  type TriggeredRisk,
} from "./types.js";

export const DEFAULT_CONTRACT_RULES: DecisionRule[] = [
  {
    id: "SHORT_TERMINATION_NOTICE",
    title: "Short termination notice",
    severity: "HIGH",
    explanation: "Auto-renewal combined with a notice period under 30 days increases lock-in risk.",
    conditions: [
      { path: "autoRenewal", op: "eq", value: true },
      { path: "noticePeriodDays", op: "lt", value: 30 },
    ],
    points: 35,
    outcome: "REVIEW_REQUIRED",
  },
  {
    id: "MISSING_EXPIRATION",
    title: "Missing expiration date",
    severity: "MEDIUM",
    explanation: "Contract expiration date was not extracted; human review is required.",
    conditions: [{ path: "expirationDate", op: "missing" }],
    points: 20,
    outcome: "REVIEW_REQUIRED",
  },
  {
    id: "HIGH_VALUE_CONTRACT",
    title: "High contract value",
    severity: "MEDIUM",
    explanation: "Contract value exceeds the configured high-value threshold.",
    conditions: [{ path: "contractValue", op: "gte", value: 100_000 }],
    points: 15,
    outcome: "REVIEW_REQUIRED",
  },
  {
    id: "UNKNOWN_COUNTERPARTY",
    title: "Missing company name",
    severity: "LOW",
    explanation: "Company/counterparty name was not found in structured extraction.",
    conditions: [{ path: "companyName", op: "missing" }],
    points: 10,
    outcome: "REVIEW_REQUIRED",
  },
];

function severityRank(severity: TriggeredRisk["severity"]): number {
  switch (severity) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

function pickOutcome(risks: TriggeredRisk[], rules: DecisionRule[]): DecisionOutcome {
  if (risks.length === 0) {
    return "ALLOW";
  }
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  let worst: DecisionOutcome = "ALLOW";
  for (const risk of risks) {
    const rule = byId.get(risk.rule);
    const hinted = rule?.outcome ?? "REVIEW_REQUIRED";
    if (hinted === "REJECT") {
      return "REJECT";
    }
    if (hinted === "REVIEW_REQUIRED") {
      worst = "REVIEW_REQUIRED";
    }
    if (risk.severity === "HIGH") {
      worst = "REVIEW_REQUIRED";
    }
  }
  return worst;
}

/**
 * Pure deterministic decision engine. Never calls an LLM.
 */
export function evaluateDecisions(
  facts: DecisionFacts,
  rules: DecisionRule[] = DEFAULT_CONTRACT_RULES,
  evidenceByField: Record<string, Evidence[]> = {},
  options: { scoreCap?: number } = {},
): DecisionResult {
  const cap = options.scoreCap ?? 100;
  const fields = { ...facts.fields };
  if (facts.documentType !== undefined) {
    fields.documentType = facts.documentType;
  }
  const metadata = facts.metadata ?? {};
  const risks: TriggeredRisk[] = [];

  for (const rule of rules) {
    const matched = rule.conditions.every((condition) =>
      evaluateCondition(condition, fields, metadata),
    );
    if (!matched) {
      continue;
    }
    const evidence: Evidence[] = [];
    for (const condition of rule.conditions) {
      const key = condition.path.replace(/^(fields|metadata)\./, "");
      const pieces = evidenceByField[key];
      if (pieces) {
        evidence.push(...pieces);
      }
    }
    risks.push({
      rule: rule.id,
      title: rule.title,
      severity: rule.severity,
      explanation: rule.explanation,
      points: Math.max(0, rule.points),
      evidence,
    });
  }

  risks.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const raw = risks.reduce((sum, item) => sum + item.points, 0);
  const riskScore = Math.min(cap, raw);

  return {
    decision: pickOutcome(risks, rules),
    riskScore,
    risks,
    rulesEvaluated: rules.length,
    note: DECISION_NOTE,
  };
}
