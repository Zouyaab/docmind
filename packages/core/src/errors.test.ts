import { describe, expect, it } from "vitest";
import { DocMindError } from "./errors.js";

describe("DocMindError", () => {
  it("carries code and message", () => {
    const err = new DocMindError("NOT_FOUND", "Document missing");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Document missing");
    expect(err.name).toBe("DocMindError");
  });

  it("optionally carries details", () => {
    const err = new DocMindError("VALIDATION_ERROR", "Bad input", { field: "filename" });
    expect(err.details).toEqual({ field: "filename" });
  });

  it("is detected by type guard", () => {
    const err = new DocMindError("INTERNAL_ERROR", "boom");
    expect(DocMindError.isDocMindError(err)).toBe(true);
    expect(DocMindError.isDocMindError(new Error("boom"))).toBe(false);
  });
});
