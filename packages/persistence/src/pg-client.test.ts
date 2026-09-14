import { describe, expect, it } from "vitest";
import { DocMindError } from "@docmind/core";
import { renderMigrationSql } from "./pg-client.js";

describe("renderMigrationSql", () => {
  it("substitutes vector dimensions in migration SQL", () => {
    const sql = "embedding vector(32) NOT NULL";
    expect(renderMigrationSql(sql, 768)).toBe("embedding vector(768) NOT NULL");
  });

  it("rejects invalid dimensions", () => {
    expect(() => renderMigrationSql("vector(32)", 0)).toThrow(DocMindError);
    expect(() => renderMigrationSql("vector(32)", 1.5)).toThrow(DocMindError);
  });
});
