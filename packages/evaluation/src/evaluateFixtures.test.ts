import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateFixtures } from "./evaluateFixtures.js";

const fixturesDir = join(import.meta.dirname, "../../../tests/fixtures");

describe("evaluateFixtures", () => {
  it("computes metrics over fixture files", async () => {
    const metrics = await evaluateFixtures(fixturesDir, [
      { filename: "invoice.txt", expectedType: "invoice" },
      { filename: "contract.txt", expectedType: "contract" },
    ]);
    expect(metrics.total).toBe(2);
    expect(metrics.correctType).toBe(2);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
  });
});
