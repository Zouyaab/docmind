import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DocMindError } from "@docmind/core";

export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  delete(key: string): Promise<boolean>;
}

function resolveSafe(rootDir: string, key: string): string {
  if (!key || key.includes("\0")) {
    throw new DocMindError("VALIDATION_ERROR", "Invalid blob key", 400);
  }

  const root = path.resolve(rootDir);
  const target = path.resolve(root, key);
  const normalizedRoot = path.normalize(root + path.sep);

  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new DocMindError("VALIDATION_ERROR", "Path traversal detected", 400);
  }

  return target;
}

export class LocalFsBlobStore implements BlobStore {
  constructor(private readonly rootDir: string) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const filePath = resolveSafe(this.rootDir, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const filePath = resolveSafe(this.rootDir, key);
    try {
      const buffer = await readFile(filePath);
      return new Uint8Array(buffer);
    } catch (error) {
      if (isEnoent(error)) {
        return undefined;
      }
      throw new DocMindError("STORAGE_ERROR", `Failed to read blob: ${key}`, 500);
    }
  }

  async delete(key: string): Promise<boolean> {
    const filePath = resolveSafe(this.rootDir, key);
    try {
      await unlink(filePath);
      return true;
    } catch (error) {
      if (isEnoent(error)) {
        return false;
      }
      throw new DocMindError("STORAGE_ERROR", `Failed to delete blob: ${key}`, 500);
    }
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
