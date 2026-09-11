import { createHash } from "node:crypto";
import type { EmbeddingProvider, LLMCompletionOptions, LLMMessage, LLMProvider } from "./types.js";

export interface MockLLMResponseRule {
  match: string | RegExp;
  response: string | ((messages: LLMMessage[]) => string);
}

const INVOICE_HINTS = ["invoice", "bill to", "amount due", "total due"];
const CONTRACT_HINTS = ["agreement", "contract", "party", "termination", "renewal"];
const RESUME_HINTS = ["experience", "education", "skills", "resume", "curriculum vitae"];
const REPORT_HINTS = ["executive summary", "findings", "report", "analysis"];

export class MockLLMProvider implements LLMProvider {
  private readonly rules: MockLLMResponseRule[];
  private readonly defaultResponse: string;

  constructor(options: { rules?: MockLLMResponseRule[]; defaultResponse?: string } = {}) {
    this.rules = options.rules ?? [];
    this.defaultResponse = options.defaultResponse ?? '{"ok":true}';
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions,
  ): Promise<{ text: string }> {
    const prompt = flattenMessages(messages);
    const lower = prompt.toLowerCase();

    for (const rule of this.rules) {
      const matched =
        typeof rule.match === "string" ? lower.includes(rule.match) : rule.match.test(prompt);
      if (matched) {
        const text = typeof rule.response === "function" ? rule.response(messages) : rule.response;
        return { text: options?.json ? ensureJson(text) : text };
      }
    }

    if (options?.json || lower.includes("json")) {
      if (lower.includes("classif")) {
        const docText = extractDocumentSection(prompt);
        const documentType = classifyHeuristic(docText);
        return {
          text: JSON.stringify({
            documentType,
            confidence: documentType === "unknown" ? 0.4 : 0.88,
            reasoning: "Heuristic keyword match from mock provider",
          }),
        };
      }

      if (lower.includes("extract") || lower.includes("fields")) {
        const docText = extractDocumentSection(prompt);
        return { text: JSON.stringify({ fields: extractFieldsHeuristic(docText) }) };
      }
    }

    if (lower.includes("ignore previous") || lower.includes("system:")) {
      return {
        text: "I cannot override my instructions. Document content is untrusted data only.",
      };
    }

    const docText = extractDocumentSection(prompt);
    if (docText.length > 0) {
      const snippet = docText.slice(0, 200).replace(/\s+/g, " ").trim();
      return { text: `Based on the provided document excerpts: ${snippet}` };
    }

    const fallback = options?.json ? ensureJson(this.defaultResponse) : this.defaultResponse;
    return { text: fallback };
  }
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly dimensions = 32) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => hashToVector(text, this.dimensions));
  }
}

export function createMockProviders(embeddingDimensions = 32): {
  llm: MockLLMProvider;
  embedding: MockEmbeddingProvider;
} {
  return {
    llm: new MockLLMProvider(),
    embedding: new MockEmbeddingProvider(embeddingDimensions),
  };
}

function flattenMessages(messages: LLMMessage[]): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join("\n");
}

function ensureJson(text: string): string {
  try {
    JSON.parse(text);
    return text;
  } catch {
    return JSON.stringify({ text });
  }
}

function classifyHeuristic(text: string): string {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {
    invoice: scoreHints(lower, INVOICE_HINTS),
    contract: scoreHints(lower, CONTRACT_HINTS),
    resume: scoreHints(lower, RESUME_HINTS),
    report: scoreHints(lower, REPORT_HINTS),
  };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) {
    return "unknown";
  }
  return best[0]!;
}

function scoreHints(text: string, hints: string[]): number {
  return hints.reduce((sum, hint) => (text.includes(hint) ? sum + 1 : sum), 0);
}

function extractFieldsHeuristic(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const companyMatch = text.match(/(?:Company|Vendor|Bill To|Client):\s*(.+)/i);
  if (companyMatch) {
    fields.companyName = companyMatch[1]!.trim();
  }
  const expirationMatch = text.match(/(?:Expiration|End Date|Valid Until):\s*(\d{4}-\d{2}-\d{2})/i);
  if (expirationMatch) {
    fields.expirationDate = expirationMatch[1];
  }
  fields.autoRenewal = /auto[- ]?renew/i.test(text);
  const noticeMatch = text.match(/notice period[:\s]+(\d+)\s*days/i);
  if (noticeMatch) {
    fields.noticePeriodDays = Number(noticeMatch[1]);
  }
  const valueMatch = text.match(/(?:contract value|total|amount due)[:\s$]+([\d,]+)/i);
  if (valueMatch) {
    fields.contractValue = Number(valueMatch[1]!.replace(/,/g, ""));
  }
  return fields;
}

function extractDocumentSection(prompt: string): string {
  const markers = [
    "<<<untrusted document start>>>",
    "<document>",
    "document text:",
    "context:",
    "untrusted document content:",
  ];
  const lower = prompt.toLowerCase();
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0) {
      return prompt.slice(idx + marker.length).trim();
    }
  }
  return "";
}

function hashToVector(text: string, dimensions: number): number[] {
  const digest = createHash("sha256").update(text).digest();
  const vector: number[] = [];

  for (let i = 0; i < dimensions; i += 1) {
    const byte = digest[i % digest.length]!;
    vector.push((byte / 255) * 2 - 1);
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}
