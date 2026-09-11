import { describe, expect, it } from "vitest";
import { evaluateDecisions, DEFAULT_CONTRACT_RULES } from "./evaluate.js";
import { evaluateCondition } from "./evaluate-condition.js";

describe("evaluateCondition", () => {
  it("supports comparison operators", () => {
    expect(evaluateCondition({ path: "x", op: "lt", value: 30 }, { x: 10 })).toBe(true);
    expect(evaluateCondition({ path: "x", op: "eq", value: true }, { x: true })).toBe(true);
    expect(evaluateCondition({ path: "name", op: "missing" }, {})).toBe(true);
    expect(evaluateCondition({ path: "name", op: "exists" }, { name: "Acme" })).toBe(true);
  });
});

describe("evaluateDecisions", () => {
  it("returns ALLOW with empty risks for a clean contract", () => {
    const result = evaluateDecisions({
      documentType: "contract",
      fields: {
        companyName: "Acme Corp",
        expirationDate: "2027-04-30",
        autoRenewal: false,
        noticePeriodDays: 60,
        contractValue: 10_000,
      },
    });
    expect(result.decision).toBe("ALLOW");
    expect(result.riskScore).toBe(0);
    expect(result.risks).toEqual([]);
    expect(result.note).toMatch(/Deterministic/);
  });

  it("flags short termination notice with auto-renewal", () => {
    const result = evaluateDecisions({
      fields: {
        companyName: "Acme",
        expirationDate: "2027-01-01",
        autoRenewal: true,
        noticePeriodDays: 14,
        contractValue: 5_000,
      },
    });
    expect(result.risks.some((r) => r.rule === "SHORT_TERMINATION_NOTICE")).toBe(true);
    expect(result.decision).toBe("REVIEW_REQUIRED");
    expect(result.riskScore).toBeGreaterThanOrEqual(35);
  });

  it("is deterministic and caps the score", () => {
    const facts = {
      fields: {
        autoRenewal: true,
        noticePeriodDays: 1,
        contractValue: 500_000,
      },
    };
    const a = evaluateDecisions(facts, DEFAULT_CONTRACT_RULES, {}, { scoreCap: 50 });
    const b = evaluateDecisions(facts, DEFAULT_CONTRACT_RULES, {}, { scoreCap: 50 });
    expect(a).toEqual(b);
    expect(a.riskScore).toBeLessThanOrEqual(50);
  });

  it("never invents LLM language in the note", () => {
    const result = evaluateDecisions({ fields: {} });
    expect(JSON.stringify(result)).not.toMatch(/guaranteed safe/i);
  });

  it("attaches field evidence to triggered risks", () => {
    const result = evaluateDecisions(
      {
        fields: {
          autoRenewal: true,
          noticePeriodDays: 14,
          expirationDate: "2027-01-01",
          companyName: "Acme",
          contractValue: 5_000,
        },
      },
      DEFAULT_CONTRACT_RULES,
      {
        noticePeriodDays: [
          {
            documentId: "doc_1",
            chunkId: "c1",
            text: "Notice period: 14 days",
          },
        ],
        autoRenewal: [
          {
            documentId: "doc_1",
            chunkId: "c2",
            text: "Auto-renewal: true",
          },
        ],
      },
    );

    const shortNotice = result.risks.find((r) => r.rule === "SHORT_TERMINATION_NOTICE");
    expect(shortNotice?.evidence.length).toBeGreaterThan(0);
    expect(shortNotice?.evidence.some((e) => e.chunkId === "c1")).toBe(true);
  });
});
