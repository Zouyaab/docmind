export type ExtractionStatus = "ok" | "unsupported_binary" | "empty";

export interface TextExtractionResult {
  text: string;
  status: ExtractionStatus;
  note?: string;
}

export function extractTextFromBytes(bytes: Uint8Array, mimeType: string): TextExtractionResult {
  if (bytes.length === 0) {
    return { text: "", status: "empty", note: "Document contains no bytes" };
  }

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\r\n/g, "\n");
    if (text.trim().length === 0) {
      return { text: "", status: "empty", note: "Text document is whitespace-only" };
    }
    return { text, status: "ok" };
  }

  if (mimeType === "application/pdf") {
    return extractPdfHeuristic(bytes);
  }

  return {
    text: "",
    status: "unsupported_binary",
    note: `No extractor available for mime type ${mimeType}`,
  };
}

function extractPdfHeuristic(bytes: Uint8Array): TextExtractionResult {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const streamMatches = latin1.match(/stream[\s\S]*?endstream/g) ?? [];
  const collected: string[] = [];

  for (const block of streamMatches) {
    const printable = block.match(/[\x20-\x7E\n\r\t]+/g);
    if (printable) {
      collected.push(...printable.map((segment) => segment.trim()).filter(Boolean));
    }
  }

  const text = collected.join("\n").replace(/\s+\n/g, "\n").trim();

  if (text.length > 0) {
    return {
      text,
      status: "ok",
      note: "PDF extracted via printable stream heuristic; layout and encoding may be lossy",
    };
  }

  return {
    text: "",
    status: "unsupported_binary",
    note: "PDF text could not be extracted with the MVP heuristic extractor; integrate a PDF library for production",
  };
}
