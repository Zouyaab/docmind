export type ExtractionStatus =
  "ok" | "unsupported_binary" | "empty" | "failed" | "scanned_or_image_only";

export interface TextExtractionResult {
  text: string;
  status: ExtractionStatus;
  note?: string;
  pageCount?: number;
}

const MAX_EXTRACT_CHARS = 2_000_000;

export function extractTextFromBytes(bytes: Uint8Array, mimeType: string): TextExtractionResult {
  if (bytes.length === 0) {
    return { text: "", status: "empty", note: "Document contains no bytes" };
  }

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\r\n/g, "\n");
    if (text.trim().length === 0) {
      return { text: "", status: "empty", note: "Text document is whitespace-only" };
    }
    return { text: text.slice(0, MAX_EXTRACT_CHARS), status: "ok" };
  }

  if (mimeType === "application/pdf") {
    return extractPdf(bytes);
  }

  return {
    text: "",
    status: "unsupported_binary",
    note: `No extractor available for mime type ${mimeType}`,
  };
}

function extractPdf(bytes: Uint8Array): TextExtractionResult {
  if (bytes.length < 5) {
    return { text: "", status: "failed", note: "PDF too small to be valid" };
  }

  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
  if (!header.startsWith("%PDF")) {
    return { text: "", status: "failed", note: "Bytes do not start with a PDF header" };
  }

  try {
    const fromObjects = extractPdfTextObjects(bytes);
    if (fromObjects.text.trim().length > 0) {
      return {
        text: fromObjects.text.slice(0, MAX_EXTRACT_CHARS),
        status: "ok",
        note: "PDF text extracted from content streams (lossy; embedded fonts may reduce quality)",
        pageCount: fromObjects.pageCount,
      };
    }

    const heuristic = extractPdfPrintableStreams(bytes);
    if (heuristic.text.trim().length > 0) {
      return {
        text: heuristic.text.slice(0, MAX_EXTRACT_CHARS),
        status: "ok",
        note: "PDF extracted via printable stream heuristic; layout/encoding may be lossy",
        pageCount: heuristic.pageCount,
      };
    }

    return {
      text: "",
      status: "scanned_or_image_only",
      note: "No extractable text found; PDF may be scanned/image-only (OCR not enabled)",
      pageCount: heuristic.pageCount,
    };
  } catch (error) {
    return {
      text: "",
      status: "failed",
      note: error instanceof Error ? error.message : "PDF extraction failed",
    };
  }
}

function extractPdfTextObjects(bytes: Uint8Array): { text: string; pageCount: number } {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const pageCount = Math.max(1, (latin1.match(/\/Type\s*\/Page[^s]/g) ?? []).length);
  const parts: string[] = [];

  // Literal strings in PDF content: (Hello World) Tj / TJ
  const literalMatches = latin1.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g);
  for (const match of literalMatches) {
    const raw = match[0].replace(/\)\s*Tj$/, "");
    const inner = raw.slice(1);
    const decoded = decodePdfLiteral(inner);
    if (decoded.trim()) parts.push(decoded);
  }

  // Hex strings: <48656C6C6F> Tj
  const hexMatches = latin1.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g);
  for (const match of hexMatches) {
    const hex = (match[1] ?? "").replace(/\s+/g, "");
    if (hex.length % 2 !== 0) continue;
    const chars: string[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      const code = Number.parseInt(hex.slice(i, i + 2), 16);
      if (code >= 32 && code <= 126) chars.push(String.fromCharCode(code));
      else if (code === 10 || code === 13) chars.push("\n");
    }
    const decoded = chars.join("");
    if (decoded.trim()) parts.push(decoded);
  }

  return {
    text: parts
      .join(" ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\s{2,}/g, " ")
      .trim(),
    pageCount,
  };
}

function extractPdfPrintableStreams(bytes: Uint8Array): { text: string; pageCount: number } {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const pageCount = Math.max(1, (latin1.match(/\/Type\s*\/Page[^s]/g) ?? []).length);
  const streamMatches = latin1.match(/stream[\s\S]*?endstream/g) ?? [];
  const collected: string[] = [];

  for (const block of streamMatches) {
    const printable = block.match(/[\x20-\x7E\n\r\t]+/g);
    if (printable) {
      collected.push(...printable.map((segment) => segment.trim()).filter((s) => s.length > 2));
    }
  }

  return {
    text: collected.join("\n").replace(/\s+\n/g, "\n").trim(),
    pageCount,
  };
}

function decodePdfLiteral(input: string): string {
  return input
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(Number.parseInt(oct, 8)));
}
