import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import type { CommandSpec } from "../types.js";
import { contractYaml, createContract, createPolicy, policyYaml } from "./templates.js";

export interface InitOptions {
  cwd: string;
  force: boolean;
  quiet: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectCommands(cwd: string): Promise<CommandSpec[]> {
  const packagePath = resolve(cwd, "package.json");
  if (!(await exists(packagePath))) return [];
  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};
    const candidates: Array<[string, string, string, number]> = [
      ["tests", "test", "Run the repository test suite", 300_000],
      ["types", "typecheck", "Run static type checking", 240_000],
      ["lint", "lint", "Run repository lint rules", 240_000],
      ["build", "build", "Build the repository", 600_000],
    ];
    return candidates
      .filter(([, script]) => typeof scripts[script] === "string")
      .map(([id, script, description, timeoutMs]) => ({
        id,
        run: script === "test" ? "npm test" : `npm run ${script}`,
        description,
        timeoutMs,
        required: id !== "build",
      }));
  } catch {
    return [];
  }
}

async function appendGitignore(cwd: string): Promise<boolean> {
  const path = resolve(cwd, ".gitignore");
  const entries = [".patchproof/proofs/", ".patchproof/keys/", ".patchproof/tmp/"];
  const current = (await exists(path)) ? await readFile(path, "utf8") : "";
  const missing = entries.filter((entry) => !current.split(/\r?\n/u).includes(entry));
  if (missing.length === 0) return false;
  const prefix = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  await writeFile(path, `${current}${prefix}\n# PatchProof local artifacts\n${missing.join("\n")}\n`, "utf8");
  return true;
}

async function writeConfig(path: string, contents: string, force: boolean): Promise<"created" | "replaced" | "kept"> {
  const present = await exists(path);
  if (present && !force) return "kept";
  await writeFile(path, contents, "utf8");
  return present ? "replaced" : "created";
}

export async function initializePatchProof(options: InitOptions): Promise<void> {
  const cwd = resolve(options.cwd);
  const configDirectory = resolve(cwd, ".patchproof");
  await mkdir(configDirectory, { recursive: true });
  const commands = await detectCommands(cwd);
  const policy = createPolicy(commands);
  const contract = createContract(commands);
  const policyPath = resolve(configDirectory, "policy.yml");
  const contractPath = resolve(configDirectory, "contract.yml");
  const policyResult = await writeConfig(policyPath, policyYaml(policy), options.force);
  const contractResult = await writeConfig(contractPath, contractYaml(contract), options.force);
  const ignored = await appendGitignore(cwd);

  if (!options.quiet) {
    process.stdout.write(`${pc.bold("PatchProof initialized")}\n`);
    process.stdout.write(`  policy    ${pc.cyan(policyResult)}  .patchproof/policy.yml\n`);
    process.stdout.write(`  contract  ${pc.cyan(contractResult)}  .patchproof/contract.yml\n`);
    process.stdout.write(`  commands  ${commands.length === 0 ? pc.yellow("none detected") : commands.map((command) => command.id).join(", ")}\n`);
    process.stdout.write(`  gitignore ${ignored ? pc.cyan("updated") : "already configured"}\n\n`);
    process.stdout.write("Commit the policy before verifying a later patch. The base-commit copy is the trusted authority.\n");
  }
}
