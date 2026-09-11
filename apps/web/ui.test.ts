import { describe, expect, it } from "vitest";
import { formatAskView, formatCitation, setBusy } from "./ui.js";

describe("web ui helpers", () => {
  it("formats citations with provenance", () => {
    expect(
      formatCitation({
        documentId: "doc_1",
        chunkId: "c1",
        page: 2,
        text: "Notice period is 14 days.",
      }),
    ).toContain("doc:doc_1");
  });

  it("formats ask views for blocked and insufficient evidence", () => {
    expect(formatAskView({ injectionBlocked: true, answer: "blocked" }).status).toBe("blocked");
    expect(formatAskView({ insufficientEvidence: true, answer: "nope" }).status).toBe(
      "insufficient",
    );
    expect(
      formatAskView({
        answer: "ok",
        citations: [{ documentId: "d", text: "t" }],
      }).citations,
    ).toHaveLength(1);
  });

  it("toggles busy state on buttons", () => {
    const button = {
      textContent: "Ask",
      disabled: false,
      dataset: {} as Record<string, string>,
    };
    setBusy(button, true, "Asking…");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Asking…");
    setBusy(button, false);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Ask");
  });
});
