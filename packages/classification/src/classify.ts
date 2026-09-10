import type { LLMProvider } from "@docmind/ai";
import type { Chunk, ConfidenceBand, Evidence } from "@docmind/core";
import { bandFromScore } from "@docmind/core";
import type { ClassificationResult, DocumentType } from "./types.js";

const KEYWORDS: Record<DocumentType, string[]> = {
  invoice: ["invoice", "bill to", "amount due", "total due", "invoice number"],
  contract: ["agreement", "contract", "termination", "renewal", "party", "governing law"],
  report: ["executive summary", "findings", "report", "analysis", "conclusion"],
  resume: ["experience", "education", "skills", "resume", "curriculum vitae", "employment"],
  unknown: [],
};

function scoreType(text: string, type: DocumentType): number {
  const lower = text.toLowerCase();
  const hits = KEYWORDS[type].filter((kw) => lower.includes(kw)).length;
  if (KEYWORDS[type].length === 0) {
    return 0;
  }
  return hits / KEYWORDS[type].length;
}

function heuristicClassify(text: string): ClassificationResult {
  const scores = (["invoice", "contract", "report", "resume"] as DocumentType[]).map((type) => ({
    type,
    score: scoreType(text, type),
  }));
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0]!;
  const documentType: DocumentType = best.score > 0 ? best.type : "unknown";
  const confidence = documentType === "unknown" ? 0.35 : Math.min(0.95, 0.5 + best.score * 0.5);
  const band: ConfidenceBand = bandFromScore(confidence);

  const evidence: Evidence[] = [];
  for (const kw of KEYWORDS[documentType] ?? []) {
    const idx = text.toLowerCase().indexOf(kw);
    if (idx >= 0) {
      evidence.push({
        documentId: "",
        text: text.slice(Math.max(0, idx - 20), idx + kw.length + 40),
      });
      break;
    }
  }

  return { documentType, confidence, band, evidence };
}

function textFromInput(input: string | Chunk[]): string {
  if (typeof input === "string") {
    return input;
  }
  return input.map((c) => c.text).join("\n");
}

export async function classifyDocument(
  input: string | Chunk[],
  options: { llm?: LLMProvider; documentId?: string } = {},
): Promise<ClassificationResult> {
  const text = textFromInput(input);
  const heuristic = heuristicClassify(text);

  if (!options.llm) {
    if (options.documentId) {
      heuristic.evidence = heuristic.evidence.map((e) => ({
        ...e,
        documentId: options.documentId!,
      }));
    }
    return heuristic;
  }

  const prompt = `Classify the following untrusted document content. Respond with JSON only: {"documentType":"invoice|contract|report|resume|unknown","confidence":0-1,"reasoning":"..."}

<document>
${text.slice(0, 4000)}
</document>`;

  try {
    const raw = await options.llm.complete(prompt, { json: true });
    const parsed = JSON.parse(raw) as {
      documentType?: string;
      confidence?: number;
    };
    const documentType = normalizeType(parsed.documentType) ?? heuristic.documentType;
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : heuristic.confidence;
    const band = bandFromScore(confidence);

    return {
      documentType,
      confidence,
      band,
      evidence: heuristic.evidence.map((e) => ({
        ...e,
        documentId: options.documentId ?? e.documentId,
      })),
    };
  } catch {
    if (options.documentId) {
      heuristic.evidence = heuristic.evidence.map((e) => ({
        ...e,
        documentId: options.documentId!,
      }));
    }
    return heuristic;
  }
}

function normalizeType(value: string | undefined): DocumentType | undefined {
  if (!value) {
    return undefined;
  }
  const lower = value.toLowerCase();
  if (["invoice", "contract", "report", "resume", "unknown"].includes(lower)) {
    return lower as DocumentType;
  }
  return undefined;
}
