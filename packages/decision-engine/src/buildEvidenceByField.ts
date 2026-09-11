import type { Chunk, Evidence } from "@docmind/core";

/**
 * Map extracted field values to provenance chunks that mention those values.
 * Used so triggered decision risks carry document/chunk evidence.
 */
export function buildEvidenceByField(
  documentId: string,
  fields: Record<string, unknown>,
  chunks: Chunk[],
): Record<string, Evidence[]> {
  const evidenceByField: Record<string, Evidence[]> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const matches: Evidence[] = [];
    for (const chunk of chunks) {
      if (!chunkMentionsField(chunk.text, key, value)) {
        continue;
      }
      const evidence: Evidence = {
        documentId,
        chunkId: chunk.id,
        text: chunk.text.slice(0, 300),
      };
      if (chunk.pageNumber !== undefined) {
        evidence.page = chunk.pageNumber;
      }
      matches.push(evidence);
      if (matches.length >= 3) {
        break;
      }
    }

    if (matches.length > 0) {
      evidenceByField[key] = matches;
    }
  }

  return evidenceByField;
}

function chunkMentionsField(text: string, key: string, value: unknown): boolean {
  const lower = text.toLowerCase();

  if (typeof value === "boolean") {
    if (key === "autoRenewal") {
      return /auto[- ]?renew/i.test(text);
    }
    return false;
  }

  if (typeof value === "number") {
    if (key === "noticePeriodDays") {
      return new RegExp(`\\b${value}\\s*days?\\b`, "i").test(text);
    }
    if (key === "contractValue") {
      const formatted = value.toLocaleString("en-US");
      return (
        lower.includes(String(value)) ||
        text.includes(formatted) ||
        lower.includes(`$${value}`) ||
        text.includes(`$${formatted}`)
      );
    }
    return lower.includes(String(value));
  }

  const needle = String(value).toLowerCase().trim();
  return needle.length > 0 && lower.includes(needle);
}
