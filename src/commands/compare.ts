import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compareProofBundles, readProofBundle, renderProofComparison } from "../proof/index.js";

export interface CompareOptions {
  json?: boolean;
  output?: string;
  failOnRegression?: boolean;
}

export async function compareBundles(before: string, after: string, cwd: string, options: CompareOptions = {}): Promise<void> {
  const paths = [resolve(cwd, before), resolve(cwd, after)];
  const [baseline, candidate] = await Promise.all(paths.map((path) => readProofBundle(path)));
  const comparison = compareProofBundles(baseline!, candidate!);
  const rendered = options.json ? `${JSON.stringify(comparison)}\n` : renderProofComparison(comparison);
  if (options.output) {
    const output = resolve(cwd, options.output);
    const key = (path: string): string => process.platform === "win32" ? path.toLowerCase() : path;
    if (paths.some((path) => key(path) === key(output))) throw new Error("Comparison output must differ from both input proof paths.");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, rendered, "utf8");
  }
  process.stdout.write(rendered);
  if (options.failOnRegression) {
    if (!comparison.comparable) process.exitCode = 2;
    else if (comparison.regressions.length) process.exitCode = 1;
  }
}
