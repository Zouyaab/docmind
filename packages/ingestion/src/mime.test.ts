import { describe, expect, it } from "vitest";
import { detectMimeFromBytes, safeFilename } from "./mime.js";

describe("safeFilename", () => {
  it("strips path components and unsafe characters", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("my report (final).pdf")).toBe("my_report_(final).pdf");
  });
});

describe("detectMimeFromBytes", () => {
  it("detects PDF by magic bytes", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n");
    expect(detectMimeFromBytes(bytes)).toBe("application/pdf");
  });

  it("detects markdown by filename and content", () => {
    const bytes = new TextEncoder().encode("# Title\n\n- item");
    expect(detectMimeFromBytes(bytes, "notes.md")).toBe("text/markdown");
  });

  it("detects plain text", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(detectMimeFromBytes(bytes, "hello.txt")).toBe("text/plain");
  });

  it("returns octet-stream for binary content", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255, 254]);
    expect(detectMimeFromBytes(bytes, "data.bin")).toBe("application/octet-stream");
  });
});
