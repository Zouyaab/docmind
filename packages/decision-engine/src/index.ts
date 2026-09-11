export type {
  DecisionFacts,
  DecisionResult,
  DecisionRule,
  Severity,
  DecisionOutcome,
} from "./types.js";
export { DECISION_NOTE } from "./types.js";
export { evaluateCondition } from "./evaluate-condition.js";
export { evaluateDecisions, DEFAULT_CONTRACT_RULES } from "./evaluate.js";
export { buildEvidenceByField } from "./buildEvidenceByField.js";
