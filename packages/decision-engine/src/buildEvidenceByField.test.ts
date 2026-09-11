import { describe, expect, it } from "vitest";
import { buildEvidenceByField } from "./buildEvidenceByField.js";

describe("buildEvidenceByField", () => {
  it("links numeric and boolean fields to matching chunks", () => {
    const evidence = buildEvidenceByField(
      "doc_1",
      {
        noticePeriodDays: 14,
        autoRenewal: true,
        companyName: "Acme Corp",
        contractValue: 150_000,
      },
      [
        {
          id: "c1",
          documentId: "doc_1",
          text: "Notice period: 14 days. Auto-renewal applies.",
          pageNumber: 1,
        },
        {
          id: "c2",
          documentId: "doc_1",
          text: "Company: Acme Corp. Contract value: $150,000",
        },
      ],
    );

    expect(evidence.noticePeriodDays?.[0]?.chunkId).toBe("c1");
    expect(evidence.autoRenewal?.[0]?.chunkId).toBe("c1");
    expect(evidence.companyName?.[0]?.chunkId).toBe("c2");
    expect(evidence.contractValue?.[0]?.chunkId).toBe("c2");
    expect(evidence.noticePeriodDays?.[0]?.page).toBe(1);
  });

  it("skips empty and unmatched fields", () => {
    const evidence = buildEvidenceByField("doc_1", { companyName: "", missingField: "zzz" }, [
      { id: "c1", documentId: "doc_1", text: "Unrelated content" },
    ]);
    expect(evidence).toEqual({});
  });
});
