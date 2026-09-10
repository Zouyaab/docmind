import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createMockProviders } from "@docmind/ai";
import { classifyDocument } from "@docmind/classification";
import { extractTextFromBytes, chunkText } from "@docmind/extraction";

export interface FixtureExpectation {
  filename: string;
  expectedType: string;
  expectedFields?: Record<string, unknown>;
}

export interface EvaluationMetrics {
  total: number;
  correctType: number;
  precision: number;
  recall: number;
  f1: number;
  details: Array<{
    filename: string;
    expected: string;
    predicted: string;
    match: boolean;
  }>;
}

export async function evaluateFixtures(
  fixturesDir: string,
  expectations: FixtureExpectation[],
): Promise<EvaluationMetrics> {
  const { llm } = createMockProviders();
  const details: EvaluationMetrics["details"] = [];
  let correctType = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const exp of expectations) {
    const filePath = join(fixturesDir, exp.filename);
    const bytes = new Uint8Array(await readFile(filePath));
    const extracted = extractTextFromBytes(bytes, "text/plain");
    const chunks = chunkText("eval-doc", extracted.text);
    const classified = await classifyDocument(chunks.length > 0 ? chunks : extracted.text, {
      llm,
      documentId: "eval-doc",
    });

    const match = classified.documentType === exp.expectedType;
    if (match) {
      correctType += 1;
      truePositives += 1;
    } else {
      falsePositives += 1;
      falseNegatives += 1;
    }

    details.push({
      filename: exp.filename,
      expected: exp.expectedType,
      predicted: classified.documentType,
      match,
    });
  }

  const precision =
    truePositives + falsePositives === 0 ? 0 : truePositives / (truePositives + falsePositives);
  const recall =
    truePositives + falseNegatives === 0 ? 0 : truePositives / (truePositives + falseNegatives);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    total: expectations.length,
    correctType,
    precision,
    recall,
    f1,
    details,
  };
}
