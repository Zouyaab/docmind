import type { FieldValue, RuleCondition } from "./types.js";

function readPath(facts: Record<string, FieldValue>, path: string): FieldValue | undefined {
  if (Object.prototype.hasOwnProperty.call(facts, path)) {
    return facts[path];
  }
  return undefined;
}

export function evaluateCondition(
  condition: RuleCondition,
  fields: Record<string, FieldValue>,
  metadata: Record<string, FieldValue> = {},
): boolean {
  const source = condition.path.startsWith("metadata.")
    ? metadata
    : condition.path.startsWith("fields.")
      ? fields
      : fields;
  const key = condition.path.replace(/^(fields|metadata)\./, "");
  const actual = readPath(source, key);

  switch (condition.op) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "missing":
      return actual === undefined || actual === null || actual === "";
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "lt":
      return (
        typeof actual === "number" &&
        typeof condition.value === "number" &&
        actual < condition.value
      );
    case "lte":
      return (
        typeof actual === "number" &&
        typeof condition.value === "number" &&
        actual <= condition.value
      );
    case "gt":
      return (
        typeof actual === "number" &&
        typeof condition.value === "number" &&
        actual > condition.value
      );
    case "gte":
      return (
        typeof actual === "number" &&
        typeof condition.value === "number" &&
        actual >= condition.value
      );
    case "includes":
      return (
        typeof actual === "string" &&
        typeof condition.value === "string" &&
        actual.toLowerCase().includes(condition.value.toLowerCase())
      );
    default:
      return false;
  }
}
