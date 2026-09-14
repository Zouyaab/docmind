export type ExtractionStatus =
  "ok" | "unsupported_binary" | "empty" | "failed" | "scanned_or_image_only";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface TextExtractionResult {
  text: string;
  status: ExtractionStatus;
  note?: string;
  pageCount?: number;
  /** Optional page segments for provenance-aware chunking. */
  pages?: ExtractedPage[];
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
    const pages = splitFormFeedPages(text);
    return {
      text: text.slice(0, MAX_EXTRACT_CHARS),
      status: "ok",
      ...(pages.length > 1
        ? { pageCount: pages.length, pages }
        : pages.length === 1
          ? { pageCount: 1, pages }
          : {}),
    };
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

function splitFormFeedPages(text: string): ExtractedPage[] {
  const parts = text
    .split("\f")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.map((pageText, index) => ({ pageNumber: index + 1, text: pageText }));
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
        pages: fromObjects.pages,
      };
    }

    const heuristic = extractPdfPrintableStreams(bytes);
    if (heuristic.text.trim().length > 0) {
      return {
        text: heuristic.text.slice(0, MAX_EXTRACT_CHARS),
        status: "ok",
        note: "PDF extracted via printable stream heuristic; layout/encoding may be lossy",
        pageCount: heuristic.pageCount,
        pages: heuristic.pages,
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

function extractPdfTextObjects(bytes: Uint8Array): {
  text: string;
  pageCount: number;
  pages: ExtractedPage[];
} {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const pageCount = Math.max(1, (latin1.match(/\/Type\s*\/Page[^s]/g) ?? []).length);
  const pageSegments = splitPdfPageSegments(latin1);
  const pages: ExtractedPage[] = pageSegments.map((segment, index) => ({
    pageNumber: index + 1,
    text: extractLiteralsFromSegment(segment),
  }));
  const nonEmpty = pages.filter((page) => page.text.trim().length > 0);
  const usable = nonEmpty.length > 0 ? nonEmpty : pages;
  return {
    text: usable
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n\f\n")
      .trim(),
    pageCount,
    pages: usable,
  };
}

function extractPdfPrintableStreams(bytes: Uint8Array): {
  text: string;
  pageCount: number;
  pages: ExtractedPage[];
} {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const pageCount = Math.max(1, (latin1.match(/\/Type\s*\/Page[^s]/g) ?? []).length);
  const pageSegments = splitPdfPageSegments(latin1);
  const pages: ExtractedPage[] = pageSegments.map((segment, index) => {
    const streamMatches = segment.match(/stream[\s\S]*?endstream/g) ?? [];
    const collected: string[] = [];
    for (const block of streamMatches) {
      const printable = block.match(/[\x20-\x7E\n\r\t]+/g);
      if (printable) {
        collected.push(...printable.map((part) => part.trim()).filter((part) => part.length > 2));
      }
    }
    return {
      pageNumber: index + 1,
      text: collected.join("\n").replace(/\s+\n/g, "\n").trim(),
    };
  });
  const nonEmpty = pages.filter((page) => page.text.trim().length > 0);
  const usable = nonEmpty.length > 0 ? nonEmpty : pages;
  return {
    text: usable
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n\f\n")
      .trim(),
    pageCount,
    pages: usable,
  };
}

function splitPdfPageSegments(latin1: string): string[] {
  const markers = [...latin1.matchAll(/\/Type\s*\/Page[^s]/g)];
  if (markers.length <= 1) {
    return [latin1];
  }
  const segments: string[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i]!.index ?? 0;
    const end = i + 1 < markers.length ? (markers[i + 1]!.index ?? latin1.length) : latin1.length;
    segments.push(latin1.slice(start, end));
  }
  return segments;
}

function extractLiteralsFromSegment(segment: string): string {
  const parts: string[] = [];

  const literalMatches = segment.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g);
  for (const match of literalMatches) {
    const raw = match[0].replace(/\)\s*Tj$/, "");
    const inner = raw.slice(1);
    const decoded = decodePdfLiteral(inner);
    if (decoded.trim()) parts.push(decoded);
  }

  const hexMatches = segment.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g);
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

  return parts
    .join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
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
