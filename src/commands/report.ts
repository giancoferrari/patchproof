import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pc from "picocolors";
import { readProofBundle, verifyProofBundle } from "../proof/index.js";
import { renderProofReport } from "../report/index.js";

export async function generateReport(input: string, output: string, cwd: string): Promise<void> {
  const bundle = await readProofBundle(resolve(cwd, input));
  const verification = verifyProofBundle(bundle);
  if (!verification.valid) {
    throw new Error(`Refusing to render an invalid proof bundle: ${verification.errors.join(" ")}`);
  }
  const outputPath = resolve(cwd, output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderProofReport(bundle), "utf8");
  process.stdout.write(`${pc.green("Report written")} ${outputPath}\n`);
}
