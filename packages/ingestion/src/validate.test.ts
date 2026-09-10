import { describe, expect, it } from "vitest";
import { DocMindError } from "@docmind/core";
import { validateUpload } from "./validate.js";

describe("validateUpload", () => {
  it("accepts valid text uploads", () => {
    const bytes = new TextEncoder().encode("hello");
    const result = validateUpload("hello.txt", bytes, { maxBytes: 1024 });
    expect(result.mimeType).toBe("text/plain");
    expect(result.hash).toHaveLength(64);
  });

  it("rejects oversized uploads", () => {
    const bytes = new Uint8Array(20);
    expect(() => validateUpload("big.bin", bytes, { maxBytes: 10 })).toThrow(DocMindError);
  });

  it("rejects unsupported mime types", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255, 254]);
    expect(() =>
      validateUpload("data.bin", bytes, {
        maxBytes: 1024,
        allowedMimes: ["text/plain"],
      }),
    ).toThrow(DocMindError);
  });
});
