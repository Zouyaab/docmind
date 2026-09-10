#!/usr/bin/env node
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateFixtures } from "./evaluateFixtures.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../../tests/fixtures");

const expectations = [
  { filename: "invoice.txt", expectedType: "invoice" },
  { filename: "contract.txt", expectedType: "contract" },
];

async function main(): Promise<void> {
  const metrics = await evaluateFixtures(fixturesDir, expectations);
  console.log(JSON.stringify(metrics, null, 2));
  process.exit(metrics.correctType === metrics.total ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
