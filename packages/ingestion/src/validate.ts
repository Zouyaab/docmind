import { DocMindError, sha256Hex } from "@docmind/core";
import { detectMimeFromBytes, safeFilename, type DetectedMime } from "./mime.js";

export interface UploadValidationOptions {
  maxBytes: number;
  allowedMimes?: DetectedMime[];
}

export interface ValidatedUpload {
  filename: string;
  mimeType: DetectedMime;
  sizeBytes: number;
  hash: string;
}

const DEFAULT_ALLOWED: DetectedMime[] = ["application/pdf", "text/plain", "text/markdown"];

export function validateUpload(
  filename: string,
  bytes: Uint8Array,
  options: UploadValidationOptions,
): ValidatedUpload {
  if (bytes.length === 0) {
    throw new DocMindError("EMPTY_DOCUMENT", "Uploaded file is empty", 400);
  }

  if (bytes.length > options.maxBytes) {
    throw new DocMindError(
      "UPLOAD_TOO_LARGE",
      `Upload exceeds maximum size (${bytes.length} > ${options.maxBytes})`,
      413,
    );
  }

  const cleanedName = safeFilename(filename);
  const mimeType = detectMimeFromBytes(bytes, cleanedName);
  const allowed = options.allowedMimes ?? DEFAULT_ALLOWED;

  if (!allowed.includes(mimeType)) {
    throw new DocMindError(
      "UNSUPPORTED_MIME",
      `Unsupported file type: ${mimeType} (${cleanedName})`,
      415,
    );
  }

  return {
    filename: cleanedName,
    mimeType,
    sizeBytes: bytes.length,
    hash: hashDocument(bytes),
  };
}

export function hashDocument(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}
