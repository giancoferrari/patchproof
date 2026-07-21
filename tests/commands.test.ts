import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateContract } from "../src/commands/contract.js";
import { runDoctor } from "../src/commands/doctor.js";
import { initializePatchProof } from "../src/commands/init.js";
import { parseContractText, parsePolicyText } from "../src/config/index.js";

const exec = promisify(execFile);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "patchproof-commands-"));
  temporaryDirectories.push(path);
  return path;
}

async function captureProcessState(action: () => Promise<void>): Promise<{
  output: string;
  exitCode: typeof process.exitCode;
}> {
  const previousExitCode = process.exitCode;
  let output = "";
  const write = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write);
  process.exitCode = undefined;

  try {
    await action();
    return {
      output: output.replace(/\u001B\[[0-9;]*m/gu, ""),
      exitCode: process.exitCode,
    };
  } finally {
    write.mockRestore();
    process.exitCode = previousExitCode;
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("initializePatchProof", () => {
  it("creates valid configuration and detects supported package scripts", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "vitest run",
          typecheck: "tsc --noEmit",
          lint: "eslint .",
          build: "tsup",
          ignored: "node ignored.js",
        },
      }),
      "utf8",
    );

    const { output } = await captureProcessState(async () =>
      initializePatchProof({ cwd: root, force: false, quiet: false }),
    );
    const policyText = await readFile(join(root, ".patchproof", "policy.yml"), "utf8");
    const contractText = await readFile(join(root, ".patchproof", "contract.yml"), "utf8");
    const policy = parsePolicyText(policyText);
    const contract = parseContractText(contractText);

    expect(policy.commands).toMatchObject([
      { id: "tests", run: "npm test", required: true },
      { id: "types", run: "npm run typecheck", required: true },
      { id: "lint", run: "npm run lint", required: true },
      { id: "build", run: "npm run build", required: false },
    ]);
    expect(contract.claims[0]?.evidence.commands).toEqual(["tests", "types", "lint"]);
    expect(output).toContain("PatchProof initialized");
    expect(output).toContain("tests, types, lint, build");
  });

  it("keeps existing configuration by default and replaces it with force", async () => {
    const root = await temporaryDirectory();
    const configDirectory = join(root, ".patchproof");
    const policyPath = join(configDirectory, "policy.yml");
    const contractPath = join(configDirectory, "contract.yml");
    await mkdir(configDirectory);
    await writeFile(policyPath, "custom policy\n", "utf8");
    await writeFile(contractPath, "custom contract\n", "utf8");

    const kept = await captureProcessState(async () =>
      initializePatchProof({ cwd: root, force: false, quiet: false }),
    );
    expect(await readFile(policyPath, "utf8")).toBe("custom policy\n");
    expect(await readFile(contractPath, "utf8")).toBe("custom contract\n");
    expect(kept.output).toMatch(/policy\s+kept/u);
    expect(kept.output).toMatch(/contract\s+kept/u);

    const replaced = await captureProcessState(async () =>
      initializePatchProof({ cwd: root, force: true, quiet: false }),
    );
    expect(parsePolicyText(await readFile(policyPath, "utf8")).version).toBe(1);
    expect(parseContractText(await readFile(contractPath, "utf8")).version).toBe(1);
    expect(replaced.output).toMatch(/policy\s+replaced/u);
    expect(replaced.output).toMatch(/contract\s+replaced/u);
  });

  it("updates .gitignore idempotently without duplicating existing entries", async () => {
    const root = await temporaryDirectory();
    const gitignorePath = join(root, ".gitignore");
    await writeFile(gitignorePath, "node_modules/\n.patchproof/proofs/\n", "utf8");

    await initializePatchProof({ cwd: root, force: false, quiet: true });
    const first = await readFile(gitignorePath, "utf8");
    await initializePatchProof({ cwd: root, force: false, quiet: true });
    const second = await readFile(gitignorePath, "utf8");

    expect(second).toBe(first);
    for (const entry of [".patchproof/proofs/", ".patchproof/keys/", ".patchproof/tmp/"]) {
      expect(second.split(/\r?\n/u).filter((line) => line === entry)).toHaveLength(1);
    }
    expect(second).toContain("node_modules/");
  });
});

describe("runDoctor", () => {
  it("reports a ready repository without setting a failing exit code", async () => {
    const root = await temporaryDirectory();
    await initializePatchProof({ cwd: root, force: false, quiet: true });
    await exec("git", ["init", "-b", "main"], { cwd: root, windowsHide: true });
    const nested = join(root, "src", "nested");
    await mkdir(nested, { recursive: true });

    const result = await captureProcessState(async () => runDoctor(nested));

    expect(result.exitCode).toBeUndefined();
    expect(result.output).toContain("Node.js");
    expect(result.output).toContain("Git repository");
    expect(result.output).toContain("Configuration");
    expect(result.output).toContain("0 commands, 4 claims");
  });

  it("sets a failing exit code when repository and configuration checks fail", async () => {
    const root = await temporaryDirectory();

    const result = await captureProcessState(async () => runDoctor(root));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Git repository");
    expect(result.output).toContain("Configuration");
  });
});

describe("generateContract validation", () => {
  it("rejects the disabled provider before contacting a model", async () => {
    const root = await temporaryDirectory();

    await expect(
      generateContract({
        cwd: root,
        task: "Describe the change",
        provider: "none",
        output: ".patchproof/contract.yml",
      }),
    ).rejects.toThrow(/Choose --provider ollama or --provider openai-compatible/u);
  });

  it("requires exactly one task source before contacting a model", async () => {
    const root = await temporaryDirectory();

    await expect(
      generateContract({ cwd: root, provider: "ollama", output: "contract.yml" }),
    ).rejects.toThrow(/Provide --task or --task-file/u);
    await expect(
      generateContract({
        cwd: root,
        task: "inline task",
        taskFile: "task.md",
        provider: "ollama",
        output: "contract.yml",
      }),
    ).rejects.toThrow(/either --task or --task-file, not both/u);
  });

  it("validates openai-compatible provider settings before contacting a model", async () => {
    const root = await temporaryDirectory();

    await expect(
      generateContract({
        cwd: root,
        task: "Describe the change",
        provider: "openai-compatible",
        endpoint: "http://127.0.0.1:1234/v1",
        output: "contract.yml",
      }),
    ).rejects.toThrow(/model/u);
  });
});
