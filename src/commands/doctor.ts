import { resolve } from "node:path";
import pc from "picocolors";
import { loadContract, loadPolicy, validateContractAgainstPolicy } from "../config/index.js";
import { DEFAULT_CONTRACT_PATH, DEFAULT_POLICY_PATH } from "../constants.js";
import { GitRepository } from "../git/index.js";

export async function runDoctor(cwd: string): Promise<void> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  let configRoot = resolve(cwd);
  checks.push({
    name: "Node.js",
    ok: Number(process.versions.node.split(".")[0]) >= 20,
    detail: process.version,
  });

  try {
    const repository = await GitRepository.discover(cwd);
    configRoot = repository.root;
    checks.push({ name: "Git repository", ok: true, detail: repository.root });
  } catch (error) {
    checks.push({ name: "Git repository", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    const policy = await loadPolicy(resolve(configRoot, DEFAULT_POLICY_PATH));
    const contract = await loadContract(resolve(configRoot, DEFAULT_CONTRACT_PATH));
    validateContractAgainstPolicy(contract.value, policy.value, DEFAULT_CONTRACT_PATH);
    checks.push({ name: "Configuration", ok: true, detail: `${policy.value.commands.length} commands, ${contract.value.claims.length} claims` });
  } catch (error) {
    checks.push({ name: "Configuration", ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  for (const check of checks) {
    process.stdout.write(`${check.ok ? pc.green("✓") : pc.red("×")} ${pc.bold(check.name)} ${check.detail}\n`);
  }
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}
