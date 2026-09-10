export type DetectedMime =
  "application/pdf" | "text/plain" | "text/markdown" | "application/octet-stream";

export function safeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "upload";
  const sanitized = base
    .replace(/[^\w.\-()+\s]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 200);

  return sanitized.length > 0 ? sanitized : "upload";
}

export function detectMimeFromBytes(bytes: Uint8Array, filename?: string): DetectedMime {
  if (bytes.length >= 4) {
    const header = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
    if (header.startsWith("%PDF")) {
      return "application/pdf";
    }
  }

  const lowerName = filename?.toLowerCase() ?? "";
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) {
    return "text/markdown";
  }

  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096));
  if (looksLikeMarkdown(sample, lowerName)) {
    return "text/markdown";
  }

  if (isMostlyText(bytes)) {
    return "text/plain";
  }

  return "application/octet-stream";
}

function looksLikeMarkdown(sample: string, lowerName: string): boolean {
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) {
    return true;
  }

  const markdownSignals = [
    /^#\s+\S/m,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /\[[^\]]+\]\([^)]+\)/,
    /^>{1,}\s+\S/m,
  ];

  return markdownSignals.some((pattern) => pattern.test(sample));
}

function isMostlyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return true;
  }

  let printable = 0;
  const limit = Math.min(bytes.length, 4096);

  for (let i = 0; i < limit; i += 1) {
    const byte = bytes[i]!;
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      printable += 1;
    }
  }

  return printable / limit >= 0.95;
}
