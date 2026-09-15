import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pc from "picocolors";
import { readProofBundle, verifyProofBundle, renderProofSummary } from "../proof/index.js";
import { renderProofReport } from "../report/index.js";

export async function generateReport(input: string, output: string, cwd: string, format: "html" | "markdown" = "html"): Promise<void> {
  const bundle = await readProofBundle(resolve(cwd, input));
  const verification = verifyProofBundle(bundle);
  if (!verification.valid) {
    throw new Error(`Refusing to render an invalid proof bundle: ${verification.errors.join(" ")}`);
  }
  const outputPath = resolve(cwd, output);
  await mkdir(dirname(outputPath), { recursive: true });
  if (outputPath === resolve(cwd, input)) throw new Error("Report output must differ from the input proof path.");
  await writeFile(outputPath, format === "markdown" ? renderProofSummary(bundle) : renderProofReport(bundle), "utf8");
  process.stdout.write(`${pc.green("Report written")} ${outputPath}\n`);
}
