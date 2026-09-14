import { describe, expect, it } from "vitest";
import { extractTextFromBytes } from "./extractText.js";

describe("extractTextFromBytes", () => {
  it("extracts plain text", () => {
    const bytes = new TextEncoder().encode("Hello world");
    const result = extractTextFromBytes(bytes, "text/plain");
    expect(result.status).toBe("ok");
    expect(result.text).toBe("Hello world");
  });

  it("extracts markdown as text", () => {
    const bytes = new TextEncoder().encode("# Title\n\nBody");
    const result = extractTextFromBytes(bytes, "text/markdown");
    expect(result.status).toBe("ok");
    expect(result.text).toContain("Title");
  });

  it("returns empty status for whitespace-only text", () => {
    const bytes = new TextEncoder().encode("   \n\t  ");
    const result = extractTextFromBytes(bytes, "text/plain");
    expect(result.status).toBe("empty");
  });

  it("marks unknown mime as unsupported", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = extractTextFromBytes(bytes, "application/octet-stream");
    expect(result.status).toBe("unsupported_binary");
    expect(result.text).toBe("");
  });

  it("extracts PDF literal Tj strings", () => {
    const pdfLike = `%PDF-1.4
BT /F1 12 Tf (Hello PDF) Tj ET
`;
    const bytes = new TextEncoder().encode(pdfLike);
    const result = extractTextFromBytes(bytes, "application/pdf");
    expect(result.status).toBe("ok");
    expect(result.text).toContain("Hello PDF");
  });

  it("attempts heuristic PDF stream extraction", () => {
    const pdfLike = `%PDF-1.4
1 0 obj
stream
Hello stream PDF
endstream
`;
    const bytes = new TextEncoder().encode(pdfLike);
    const result = extractTextFromBytes(bytes, "application/pdf");
    expect(result.status).toBe("ok");
    expect(result.text).toContain("Hello stream PDF");
  });

  it("reports scanned_or_image_only when PDF has no extractable text", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00, 0x01]);
    const result = extractTextFromBytes(bytes, "application/pdf");
    expect(result.status).toBe("scanned_or_image_only");
    expect(result.note?.toLowerCase()).toMatch(/scanned|ocr|no extractable/);
  });

  it("extracts page-aware PDF segments when multiple Page objects exist", () => {
    const pdfLike = `%PDF-1.4
/Type /Page
BT (Page One Title) Tj ET
/Type /Page
BT (Page Two Body) Tj ET
`;
    const bytes = new TextEncoder().encode(pdfLike);
    const result = extractTextFromBytes(bytes, "application/pdf");
    expect(result.status).toBe("ok");
    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    expect(result.pages?.length).toBeGreaterThanOrEqual(2);
    expect(result.pages?.[0]?.text).toContain("Page One Title");
    expect(result.pages?.[1]?.text).toContain("Page Two Body");
  });

  it("rejects non-PDF bytes labeled as PDF", () => {
    const bytes = new TextEncoder().encode("not a pdf");
    const result = extractTextFromBytes(bytes, "application/pdf");
    expect(result.status).toBe("failed");
  });
});
