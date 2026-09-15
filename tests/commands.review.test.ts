import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareBundles, generateReport, runDoctor, verifyBundleCommand } from "../src/commands/index.js";
import { generateSigningKeyPair, signProofBundle, writeProofBundle } from "../src/proof/index.js";
import { createDemoBundle } from "../src/report/demo.js";
import { passingProof, rebuildProof } from "./helpers/proof.js";

const exec = promisify(execFile);
let root: string;
let output = "";
let previousExit: typeof process.exitCode;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "patchproof-review-"));
  previousExit = process.exitCode;
  process.exitCode = undefined;
  output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output += String(chunk); return true;
  }) as typeof process.stdout.write);
});
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = previousExit;
  await rm(root, { recursive: true, force: true });
});

describe("review commands", () => {
  it("writes a JSON comparison and exits 1 for a regression", async () => {
    await writeProofBundle(join(root, "before.json"), passingProof());
    await writeProofBundle(join(root, "after.json"), createDemoBundle());
    await compareBundles("before.json", "after.json", root, { json: true, failOnRegression: true, output: "review/comparison.json" });
    expect(JSON.parse(output).regressions.length).toBeGreaterThan(0);
    expect(await readFile(join(root, "review/comparison.json"), "utf8")).toBe(output);
    expect(process.exitCode).toBe(1);
  });

  it("exits 2 for a changed policy even when the candidate looks improved", async () => {
    const after = passingProof();
    after.policy.value.thresholds.maxChangedLines += 1;
    await writeProofBundle(join(root, "before.json"), createDemoBundle());
    await writeProofBundle(join(root, "after.json"), rebuildProof(after));
    await compareBundles("before.json", "after.json", root, { failOnRegression: true });
    expect(process.exitCode).toBe(2);
    expect(output).toContain("inconclusive");
  });

  it("keeps a successful gate successful and protects input proofs", async () => {
    await writeProofBundle(join(root, "before.json"), createDemoBundle());
    await writeProofBundle(join(root, "after.json"), passingProof());
    await compareBundles("before.json", "after.json", root, { failOnRegression: true });
    expect(process.exitCode).toBeUndefined();
    await expect(compareBundles("before.json", "after.json", root, { output: "before.json" })).rejects.toThrow(/must differ/u);
    await expect(generateReport("before.json", "before.json", root)).rejects.toThrow(/must differ/u);
  });

  it("renders Markdown from an existing proof", async () => {
    await writeProofBundle(join(root, "proof.json"), createDemoBundle());
    await generateReport("proof.json", "review/summary.md", root, "markdown");
    expect(await readFile(join(root, "review/summary.md"), "utf8")).toContain("## PatchProof: rejected");
  });

  it("loads trusted key files and enforces acceptance requirements", async () => {
    const keys = generateSigningKeyPair();
    await writeFile(join(root, "trusted.pem"), keys.publicKey);
    await writeProofBundle(join(root, "signed.json"), signProofBundle(passingProof(), keys.privateKey));
    await verifyBundleCommand("signed.json", root, true, { trustedKey: ["trusted.pem"], requireVerified: true });
    expect(JSON.parse(output)).toEqual({ valid: true, errors: [], signature: "valid" });
    output = "";
    await verifyBundleCommand("signed.json", root, false, { trustedKey: ["trusted.pem"] });
    expect(output).toContain("matched the verifier's trusted key list");
    output = "";
    await verifyBundleCommand("signed.json", root, true, { trustedKey: ["missing.pem"] });
    expect(JSON.parse(output).valid).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it.each(["null", "{bad json", '{"schemaVersion":"1.0"}'])("returns machine-readable failure for malformed imported JSON %s", async (contents) => {
    await writeFile(join(root, "proof.json"), contents);
    await verifyBundleCommand("proof.json", root, true);
    expect(JSON.parse(output)).toMatchObject({ valid: false, errors: [expect.any(String)] });
    expect(process.exitCode).toBe(1);
  });

  it("returns structured diagnostic failures", async () => {
    await runDoctor(root, { json: true, preflight: true });
    const result = JSON.parse(output);
    expect(result.ready).toBe(false);
    expect(result.checks.some((check: { remediation?: string }) => check.remediation)).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});

describe("GitHub Action result handoff", () => {
  it("publishes a rejected verdict and appends the generated review summary", async () => {
    const summary = join(root, "summary.md");
    const jobSummary = join(root, "job.md");
    const actionOutput = join(root, "outputs.txt");
    await writeFile(summary, "## PatchProof: rejected\n\nFix the skipped test.\n");
    await writeFile(jobSummary, "Earlier step\n");
    await exec(process.execPath, [resolve("scripts/action-result.mjs")], {
      windowsHide: true,
      env: { ...process.env, PATCHPROOF_RESULT: JSON.stringify({ verdict: { status: "rejected" }, proof: "proof.json", summary }), GITHUB_OUTPUT: actionOutput, GITHUB_STEP_SUMMARY: jobSummary },
    });
    expect(await readFile(actionOutput, "utf8")).toBe("verdict=rejected\n");
    expect(await readFile(jobSummary, "utf8")).toBe("Earlier step\n## PatchProof: rejected\n\nFix the skipped test.\n");
  });

  it("rejects an absent verification result instead of showing a stale proof", async () => {
    await expect(exec(process.execPath, [resolve("scripts/action-result.mjs")], {
      windowsHide: true, env: { ...process.env, PATCHPROOF_RESULT: "" },
    })).rejects.toThrow(/no proof summary was published/u);
  });
});
