import type { Chunk } from "@docmind/core";
import { createId } from "@docmind/core";

export interface ChunkTextOptions {
  maxChars?: number;
  overlapChars?: number;
  pageNumber?: number;
}

const DEFAULT_MAX_CHARS = 800;
const DEFAULT_OVERLAP = 100;

export function chunkText(
  documentId: string,
  text: string,
  options: ChunkTextOptions = {},
): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP, maxChars - 1);

  if (maxChars <= 0) {
    throw new RangeError("maxChars must be positive");
  }

  if (text.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    if (end < text.length) {
      const boundary = findBreakIndex(text, start, end);
      if (boundary > start) {
        end = boundary;
      }
    }

    const slice = text.slice(start, end);
    const chunk: Chunk = {
      id: createId(),
      documentId,
      text: slice,
      startOffset: start,
      endOffset: end,
      metadata: {},
    };

    if (options.pageNumber !== undefined) {
      chunk.pageNumber = options.pageNumber;
    }

    chunks.push(chunk);

    if (end >= text.length) {
      break;
    }

    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}

function findBreakIndex(text: string, start: number, end: number): number {
  const window = text.slice(start, end);
  const candidates = ["\n\n", "\n", ". ", " "];

  for (const marker of candidates) {
    const idx = window.lastIndexOf(marker);
    if (idx > 0) {
      return start + idx + marker.length;
    }
  }

  return end;
}
