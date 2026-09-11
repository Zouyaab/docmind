import { describe, expect, it } from "vitest";
import { isAnswerGrounded, significantTokens } from "./grounding.js";

describe("grounding", () => {
  it("extracts significant tokens", () => {
    const tokens = significantTokens("Termination requires 30 days written notice.");
    expect(tokens.has("termination")).toBe(true);
    expect(tokens.has("written")).toBe(true);
    expect(tokens.has("with")).toBe(false);
  });

  it("detects grounded vs ungrounded answers", () => {
    const evidence = ["Termination requires 30 days written notice."];
    expect(
      isAnswerGrounded("Based on excerpts: Termination requires 30 days written notice.", evidence),
    ).toBe(true);
    expect(isAnswerGrounded("The moon is made of cheese and unrelated secrets.", evidence)).toBe(
      false,
    );
  });
});
