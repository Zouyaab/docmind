import { describe, expect, it, vi } from "vitest";
import { DocMindError } from "@docmind/core";
import { runCli } from "./index.js";

describe("runCli", () => {
  it("prints version", async () => {
    const lines: string[] = [];
    const code = await runCli(["node", "docmind", "--version"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
      env: {},
    });
    expect(code).toBe(0);
    expect(lines[0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("returns usage exit code for unknown commands", async () => {
    const code = await runCli(["node", "docmind", "nope"], {
      stdout: () => undefined,
      stderr: () => undefined,
      env: {},
    });
    expect(code).toBe(1);
  });

  it("maps timeout errors to exit code 2", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const errs: string[] = [];
    const code = await runCli(["node", "docmind", "health"], {
      stdout: () => undefined,
      stderr: (line) => errs.push(line),
      env: { DOCMIND_TIMEOUT_MS: "1" },
      fetchImpl,
    });
    expect(code).toBe(2);
    expect(errs[0]?.toLowerCase()).toMatch(/timed out|aborted|timeout/);
  });

  it("maps API errors to exit code 1", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: { code: "UNAUTHORIZED", message: "nope" } }),
    });
    const code = await runCli(["node", "docmind", "health"], {
      stdout: () => undefined,
      stderr: () => undefined,
      env: {},
      fetchImpl,
    });
    expect(code).toBe(1);
  });

  it("ingests a file through the SDK client", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          document: { id: "doc_1", filename: "a.txt" },
          duplicate: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "completed", chunks: 1 }),
      });

    const lines: string[] = [];
    const code = await runCli(["node", "docmind", "ingest", "a.txt"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
      env: {},
      fetchImpl,
      readFile: async () => new TextEncoder().encode("hello"),
    });
    expect(code).toBe(0);
    expect(lines.join("")).toContain("doc_1");
    expect(DocMindError.isDocMindError(new DocMindError("X", "y"))).toBe(true);
  });
});
