export class DocMindError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusOrDetails: number | Record<string, unknown> = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DocMindError";
    this.code = code;
    if (typeof statusOrDetails === "number") {
      this.statusCode = statusOrDetails;
      if (details) this.details = details;
    } else {
      this.statusCode = 400;
      this.details = statusOrDetails;
    }
  }

  static isDocMindError(value: unknown): value is DocMindError {
    return value instanceof DocMindError;
  }
}
