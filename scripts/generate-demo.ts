import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDemoBundle } from "../src/report/demo.js";
import { renderProofReport } from "../src/report/render.js";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "examples");
await mkdir(output, { recursive: true });
const bundle = createDemoBundle();
await Promise.all([
  writeFile(resolve(output, "demo-proof.json"), `${JSON.stringify(bundle, null, 2)}\n`, "utf8"),
  writeFile(resolve(output, "patchproof-report.html"), renderProofReport(bundle), "utf8"),
]);
process.stdout.write(`Generated demo proof and report in ${output}\n`);
