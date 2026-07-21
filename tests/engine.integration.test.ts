import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { verifyPatch } from "../src/engine.js";

const exec = promisify(execFile);
const temporaryDirectories: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec("git", args, { cwd, windowsHide: true });
  return result.stdout.trim();
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createTwoCommitRepository(): Promise<{
  root: string;
  baseCommit: string;
  headCommit: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "patchproof-engine-"));
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
id: integration-contract
title: Verify integration change
claims:
  - id: behavior
    statement: The changed behavior passes the test command.
    severity: blocking
    evidence:
      commands: [tests]
      requireTestChange: true
  - id: protections
    statement: Existing tests remain active.
    severity: blocking
    evidence:
      rules: [test-integrity, scope]
outOfScope: []
`,
    "utf8",
  );
  await writeFile(join(root, "src", "value.js"), "export const value = 1;\n", "utf8");
  await writeFile(join(root, "tests", "value.test.js"), "// test fixture\n", "utf8");
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.email", "patchproof@example.test");
  await git(root, "config", "user.name", "PatchProof Test");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "base");
  const baseCommit = await git(root, "rev-parse", "HEAD");

  await writeFile(join(root, "src", "value.js"), "export const value = 2;\n", "utf8");
  await writeFile(join(root, "tests", "value.test.js"), "// test fixture for value 2\n", "utf8");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "change behavior with test");
  const headCommit = await git(root, "rev-parse", "HEAD");

  return { root, baseCommit, headCommit };
}

function verificationOptions(root: string, baseCommit: string, headRef: string) {
  return {
    cwd: root,
    baseRef: baseCommit,
    headRef,
    policyPath: ".patchproof/policy.yml",
    contractPath: ".patchproof/contract.yml",
    runCommands: true,
    explicitPolicy: false,
    packageVersion: "test",
  } as const;
}

describe("verification engine", () => {
  it("verifies a real two-commit repository using base-sealed policy", async () => {
    const { root, baseCommit } = await createTwoCommitRepository();

    const bundle = await verifyPatch(verificationOptions(root, baseCommit, "HEAD"));
    expect(bundle.policy.seal.source).toBe("base-commit");
    expect(bundle.verdict.status).toBe("verified");
    expect(bundle.claims.every((claim) => claim.status === "proven")).toBe(true);
    expect(bundle.evidence.some((record) => record.producer === "command:tests" && record.status === "passed")).toBe(true);
  });

  it("refuses to run verification commands from a dirty checkout", async () => {
    const { root, baseCommit, headCommit } = await createTwoCommitRepository();
    await writeFile(join(root, "untracked-local-file.txt"), "not part of the recorded patch\n", "utf8");

    await expect(
      verifyPatch(verificationOptions(root, baseCommit, headCommit)),
    ).rejects.toThrow(/clean working tree|changed or untracked/iu);
  });

  it("refuses to run verification commands when HEAD is not the recorded patch head", async () => {
    const { root, baseCommit, headCommit } = await createTwoCommitRepository();
    await git(root, "checkout", "--detach", baseCommit);

    await expect(
      verifyPatch(verificationOptions(root, baseCommit, headCommit)),
    ).rejects.toThrow(/exact commit|proof head/iu);
  });
});
