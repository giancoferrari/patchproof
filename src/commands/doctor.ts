import { resolve } from "node:path";
import pc from "picocolors";
import { loadContract, loadPolicy, loadSealedPolicy, validateContractAgainstPolicy } from "../config/index.js";
import { DEFAULT_CONTRACT_PATH, DEFAULT_POLICY_PATH } from "../constants.js";
import { GitRepository, GitError } from "../git/index.js";
import { canonicalJson, sha256 } from "../utils/index.js";

export interface DoctorOptions {
  json?: boolean;
  preflight?: boolean;
  base?: string;
  head?: string;
  policy?: string;
  contract?: string;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  remediation?: string;
}

export interface DoctorResult {
  ready: boolean;
  checks: DoctorCheck[];
  warnings: string[];
  contractDigest: string | null;
}

function errorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof GitError && error.stderr ? `${message}. ${error.stderr}` : message;
}

/** Read-only readiness checks. Does not run repository commands or change Git state. */
export async function diagnoseRepository(cwd: string, options: DoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const warnings: string[] = [];
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  checks.push({ name: "Node.js", ok: major > 20 || (major === 20 && minor >= 12), detail: process.version,
    remediation: "Use Node.js 20.12 or newer." });
  let repository: GitRepository | undefined;

  try {
    repository = await GitRepository.discover(cwd);
    checks.push({ name: "Git repository", ok: true, detail: repository.root });
  } catch (error) {
    checks.push({ name: "Git repository", ok: false, detail: errorDetail(error), remediation: "Run PatchProof inside the Git repository you want to verify." });
  }
  const configRoot = repository?.root ?? resolve(cwd);
  const policyPath = options.policy ?? DEFAULT_POLICY_PATH;
  const contractPath = options.contract ?? DEFAULT_CONTRACT_PATH;
  let contract: Awaited<ReturnType<typeof loadContract>> | undefined;
  let contractDigest: string | null = null;
  try {
    const policy = await loadPolicy(resolve(configRoot, policyPath));
    contract = await loadContract(resolve(configRoot, contractPath));
    contractDigest = sha256(canonicalJson(contract.value));
    validateContractAgainstPolicy(contract.value, policy.value, contractPath);
    checks.push({ name: "Configuration", ok: true, detail: `${policy.value.commands.length} commands, ${contract.value.claims.length} claims` });
    if (!policy.value.commands.some((command) => command.required)) warnings.push("No required commands are configured. Passing rules alone do not demonstrate that tests or builds ran.");
  } catch (error) {
    checks.push({ name: "Configuration", ok: false, detail: errorDetail(error), remediation: "Run patchproof init if configuration is missing, then correct the reported policy or contract fields." });
  }
  if (repository && (options.preflight || options.base !== undefined)) {
    let baseCommit: string | undefined;
    let headCommit: string | undefined;
    try {
      const baseRef = options.base ?? await repository.resolveDefaultBaseRef();
      const refs = await repository.resolveComparisonRefs(baseRef, options.head ?? "HEAD");
      baseCommit = refs.baseCommit;
      headCommit = refs.headCommit;
      checks.push({ name: "Comparison", ok: true, detail: `${baseRef} (${baseCommit}) -> ${options.head ?? "HEAD"} (${headCommit})` });
      if (baseCommit === headCommit) warnings.push("Base and head resolve to the same commit. Select the intended base before verifying a change.");
    } catch (error) {
      checks.push({ name: "Comparison", ok: false, detail: errorDetail(error), remediation: "Pass --base <trusted-ref> and fetch enough Git history to resolve both commits." });
    }
    if (baseCommit) {
      try {
        const sealed = await loadSealedPolicy(repository, baseCommit, policyPath);
        if (contract) validateContractAgainstPolicy(contract.value, sealed.value, contractPath);
        checks.push({ name: "Trusted policy", ok: true, detail: `${sealed.seal.sourceRef}:${policyPath}` });
      } catch (error) {
        checks.push({ name: "Trusted policy", ok: false, detail: errorDetail(error), remediation: "Commit a valid policy on the trusted base branch. The candidate contract must reference commands and rules in that base policy." });
      }
    }
    if (headCommit) {
      try {
        await repository.assertCommandCheckout(headCommit);
        checks.push({ name: "Command checkout", ok: true, detail: "Clean working tree at the requested candidate commit" });
      } catch (error) {
        checks.push({ name: "Command checkout", ok: false, detail: errorDetail(error), remediation: "Commit or stash local changes and check out the requested head. Use verify --no-commands for analysis with skipped command evidence." });
      }
    }
  }
  return { ready: checks.every((check) => check.ok), checks, warnings, contractDigest };
}

export async function runDoctor(cwd: string, options: DoctorOptions = {}): Promise<void> {
  const result = await diagnoseRepository(cwd, options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    for (const check of result.checks) {
      process.stdout.write(`${check.ok ? pc.green("✓") : pc.red("×")} ${pc.bold(check.name)} ${check.detail}\n`);
      if (!check.ok && check.remediation) process.stdout.write(`  Fix: ${check.remediation}\n`);
    }
    for (const warning of result.warnings) process.stdout.write(`${pc.yellow("!")} ${warning}\n`);
    if (result.contractDigest) process.stdout.write(`Contract digest: ${result.contractDigest}\n`);
    if (!options.preflight && options.base === undefined) process.stdout.write("Run patchproof doctor --base <trusted-ref> to check verification readiness.\n");
  }
  if (!result.ready) process.exitCode = 1;
}
