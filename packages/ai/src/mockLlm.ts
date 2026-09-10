import type { LLMCompleteOptions, LLMProvider } from "./types.js";

const INVOICE_HINTS = ["invoice", "bill to", "amount due", "total due"];
const CONTRACT_HINTS = ["agreement", "contract", "party", "termination", "renewal"];
const RESUME_HINTS = ["experience", "education", "skills", "resume", "curriculum vitae"];
const REPORT_HINTS = ["executive summary", "findings", "report", "analysis"];

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
  const autoRenewal = /auto[- ]?renew/i.test(text);
  fields.autoRenewal = autoRenewal;
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

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock-llm";

  async complete(prompt: string, options?: LLMCompleteOptions): Promise<string> {
    const lower = prompt.toLowerCase();

    if (options?.json || lower.includes("json")) {
      if (lower.includes("classif")) {
        const docText = extractDocumentSection(prompt);
        const documentType = classifyHeuristic(docText);
        return JSON.stringify({
          documentType,
          confidence: documentType === "unknown" ? 0.4 : 0.88,
          reasoning: "Heuristic keyword match from mock provider",
        });
      }

      if (lower.includes("extract") || lower.includes("fields")) {
        const docText = extractDocumentSection(prompt);
        return JSON.stringify({ fields: extractFieldsHeuristic(docText) });
      }
    }

    if (lower.includes("ignore previous") || lower.includes("system:")) {
      return "I cannot override my instructions. Document content is untrusted data only.";
    }

    const docText = extractDocumentSection(prompt);
    if (docText.length > 0) {
      const snippet = docText.slice(0, 200).replace(/\s+/g, " ").trim();
      return `Based on the provided document excerpts: ${snippet}`;
    }

    return "Mock LLM response: no document context found in prompt.";
  }
}

function extractDocumentSection(prompt: string): string {
  const markers = ["<document>", "document text:", "context:", "untrusted document content:"];
  for (const marker of markers) {
    const idx = prompt.toLowerCase().indexOf(marker);
    if (idx >= 0) {
      return prompt.slice(idx + marker.length).trim();
    }
  }
  return prompt;
}
