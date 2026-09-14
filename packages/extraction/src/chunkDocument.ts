import type { Chunk } from "@docmind/core";
import type { ExtractedPage, TextExtractionResult } from "./extractText.js";
import { chunkText, type ChunkTextOptions } from "./chunkText.js";

/**
 * Build provenance-aware chunks from an extraction result.
 * Prefers explicit page segments, then form-feed splits, then plain sliding windows.
 * Each chunk records pageNumber (when known) and a best-effort section heading.
 */
export function chunkExtractedDocument(
  documentId: string,
  extraction: Pick<TextExtractionResult, "text" | "pages" | "pageCount">,
  options: ChunkTextOptions = {},
): Chunk[] {
  const pages = resolvePages(extraction);
  if (pages.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  for (const page of pages) {
    const pageChunks = chunkText(documentId, page.text, {
      ...options,
      pageNumber: page.pageNumber,
    });
    for (const chunk of pageChunks) {
      const heading = detectSectionHeading(chunk.text);
      chunks.push({
        ...chunk,
        metadata: {
          ...(chunk.metadata ?? {}),
          ...(heading ? { section: heading } : {}),
          ...(extraction.pageCount ? { documentPageCount: extraction.pageCount } : {}),
          provenance: "page-aware",
        },
      });
    }
  }
  return chunks;
}

function resolvePages(
  extraction: Pick<TextExtractionResult, "text" | "pages" | "pageCount">,
): ExtractedPage[] {
  if (extraction.pages && extraction.pages.length > 0) {
    return extraction.pages.filter((page) => page.text.trim().length > 0);
  }

  const formFeedPages = extraction.text
    .split("\f")
    .map((text) => text.trim())
    .filter((text) => text.length > 0);
  if (formFeedPages.length > 1) {
    return formFeedPages.map((text, index) => ({ pageNumber: index + 1, text }));
  }

  if (!extraction.text.trim()) {
    return [];
  }

  return [{ pageNumber: 1, text: extraction.text }];
}

function detectSectionHeading(text: string): string | undefined {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return undefined;
  if (firstLine.length > 80) return undefined;
  if (/^#{1,6}\s+\S/.test(firstLine)) {
    return firstLine.replace(/^#{1,6}\s+/, "").trim();
  }
  if (/^[A-Z0-9][A-Z0-9 ,./&()-]{3,}$/.test(firstLine) && /[A-Z]/.test(firstLine)) {
    return firstLine;
  }
  return undefined;
}
