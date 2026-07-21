import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runVerification } from "../src/commands/verify.js";
import { readProofBundle, verifyProofBundle } from "../src/proof/index.js";

const exec = promisify(execFile);
const temporaryDirectories: string[] = [];
let originalExitCode: number | string | null | undefined;
let stdout = "";

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec("git", args, { cwd, windowsHide: true });
  return result.stdout.trim();
}

async function createVerificationRepository(options: {
  weakenTest?: boolean;
} = {}): Promise<{ root: string; baseCommit: string; headCommit: string }> {
  const root = await mkdtemp(join(tmpdir(), "patchproof-command-verify-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, ".patchproof"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "tests"));
  await writeFile(
    join(root, ".patchproof", "policy.yml"),
    `version: 1
commands:
  - id: tests
    run: node -e "process.exit(0)"
    description: Run tests
    timeoutMs: 10000
    required: true
scope:
  allowed: ["src/**", "tests/**"]
  denied: [".patchproof/policy.yml"]
thresholds:
  maxChangedFiles: 10
  maxChangedLines: 100
  requireTestsForSourceChanges: true
rules:
  policyIntegrity: true
  testIntegrity: true
  secretScan: true
  dependencyReview: true
  scope: true
  diffSize: true
model:
  provider: none
redactions: []
`,
    "utf8",
  );
  await writeFile(
    join(root, ".patchproof", "contract.yml"),
    `version: 1
id: command-verify-contract
title: Verify command behavior
claims:
  - id: behavior
    statement: The changed behavior has passing tests and remains in scope.
    severity: blocking
    evidence:
      commands: [tests]
      rules: [scope]
      paths: ["src/**"]
      requireTestChange: true
outOfScope: []
`,
    "utf8",
  );
  await writeFile(join(root, "src", "value.js"), "export const value = 1;\n", "utf8");
  await writeFile(
    join(root, "tests", "value.test.js"),
    "test('value', () => expect(value).toBe(1));\n",
    "utf8",
  );
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.email", "patchproof@example.test");
  await git(root, "config", "user.name", "PatchProof Test");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "base");
  const baseCommit = await git(root, "rev-parse", "HEAD");

  await writeFile(join(root, "src", "value.js"), "export const value = 2;\n", "utf8");
  await writeFile(
    join(root, "tests", "value.test.js"),
    options.weakenTest
      ? "test.skip('value', () => expect(value).toBe(2));\n"
      : "test('value', () => expect(value).toBe(2));\n",
    "utf8",
  );
  await git(root, "add", ".");
  await git(root, "commit", "-m", "change behavior with test");
  const headCommit = await git(root, "rev-parse", "HEAD");
  const canonicalRoot = resolve(await git(root, "rev-parse", "--show-toplevel"));
  return { root: canonicalRoot, baseCommit, headCommit };
}

function commandOptions(
  root: string,
  baseCommit: string,
  headCommit: string,
  commands: boolean,
) {
  return {
    cwd: root,
    base: baseCommit,
    head: headCommit,
    policy: ".patchproof/policy.yml",
    contract: ".patchproof/contract.yml",
    commands,
    trustWorkingPolicy: false,
    output: "artifacts/proof.json",
    report: false,
    json: true,
  } as const;
}

beforeEach(() => {
  originalExitCode = process.exitCode;
  process.exitCode = undefined;
  stdout = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write);
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("verify command", () => {
  it("prints JSON, writes every requested artifact, and leaves a verified exit code successful", async () => {
    const { root, baseCommit, headCommit } = await createVerificationRepository();
    const options = {
      ...commandOptions(root, baseCommit, headCommit, true),
      report: "artifacts/report.html",
      sarif: "artifacts/proof.sarif.json",
    };

    await runVerification(options);

    const output = JSON.parse(stdout.trim()) as {
      verdict: { status: string };
      proof: string;
      report: string;
      sarif: string;
    };
    expect(output.verdict.status).toBe("verified");
    expect(output.proof).toBe(join(root, "artifacts", "proof.json"));
    expect(output.report).toBe(join(root, "artifacts", "report.html"));
    expect(output.sarif).toBe(join(root, "artifacts", "proof.sarif.json"));
    expect(process.exitCode).toBeUndefined();
    expect(await readFile(output.report, "utf8")).toContain("<!doctype html>");
    expect(JSON.parse(await readFile(output.sarif, "utf8"))).toMatchObject({ version: "2.1.0" });
    expect(verifyProofBundle(await readProofBundle(output.proof)).valid).toBe(true);
  });

  it("resolves configuration and artifacts from the repository root when invoked below it", async () => {
    const { root, baseCommit, headCommit } = await createVerificationRepository();

    await runVerification(commandOptions(join(root, "src"), baseCommit, headCommit, true));

    const output = JSON.parse(stdout.trim()) as { verdict: { status: string }; proof: string };
    expect(output.verdict.status).toBe("verified");
    expect(output.proof).toBe(join(root, "artifacts", "proof.json"));
    expect(await readFile(output.proof, "utf8")).toContain('"schemaVersion": "1.0"');
  });

  it("sets exit code 2 when required command evidence is skipped", async () => {
    const { root, baseCommit, headCommit } = await createVerificationRepository();

    await runVerification(commandOptions(root, baseCommit, headCommit, false));

    const output = JSON.parse(stdout.trim()) as { verdict: { status: string } };
    expect(output.verdict.status).toBe("incomplete");
    expect(process.exitCode).toBe(2);
  });

  it("sets exit code 1 when deterministic analysis rejects the patch", async () => {
    const { root, baseCommit, headCommit } = await createVerificationRepository({ weakenTest: true });

    await runVerification(commandOptions(root, baseCommit, headCommit, true));

    const output = JSON.parse(stdout.trim()) as { verdict: { status: string; blockingFindings: number } };
    expect(output.verdict.status).toBe("rejected");
    expect(output.verdict.blockingFindings).toBeGreaterThan(0);
    expect(process.exitCode).toBe(1);
  });
});
