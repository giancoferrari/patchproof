import { resolve } from "node:path";
import { createBuiltinAnalyzers, runAnalyzers } from "./analyzers/index.js";
import {
  loadContract,
  loadPolicy,
  loadSealedPolicy,
  validateContractAgainstPolicy,
} from "./config/index.js";
import { GitRepository } from "./git/index.js";
import {
  createProofBundle,
  evaluateClaims,
  sealEvidence,
  computeVerdict,
} from "./proof/index.js";
import { CommandRunner } from "./runner/index.js";
import type {
  AnalyzerContext,
  CommandSpec,
  EvidenceRecord,
  PolicySeal,
  ProofBundle,
  VerificationOptions,
} from "./types.js";
import { canonicalJson, sha256, stableId } from "./utils/index.js";
import { redactSecrets } from "./utils/redaction.js";

type EvidenceDraft = Omit<EvidenceRecord, "previousDigest" | "digest">;

async function commandEvidence(
  runner: CommandRunner,
  command: CommandSpec,
  patchDigest: string,
  redactions: readonly string[],
): Promise<EvidenceDraft> {
  try {
    const result = await runner.run(command);
    const status: EvidenceRecord["status"] = result.succeeded
      ? "passed"
      : result.timedOut || result.aborted
        ? "error"
        : "failed";
    const qualifier = result.timedOut
      ? "timed out"
      : result.aborted
        ? "was aborted"
        : result.succeeded
          ? "passed"
          : `failed with exit code ${result.exitCode ?? "unknown"}`;
    return {
      id: stableId("evidence", patchDigest, "command", command.id),
      type: "command",
      producer: `command:${command.id}`,
      status,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      summary: `${command.description ?? command.id} ${qualifier}.`,
      command: result.command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      relatedFiles: [],
      metadata: {
        commandId: command.id,
        required: command.required,
        inheritEnv: [...(command.inheritEnv ?? [])].sort(),
        cwd: command.cwd ?? ".",
        timedOut: result.timedOut,
        aborted: result.aborted,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated,
      },
    };
  } catch (error) {
    const timestamp = new Date().toISOString();
    return {
      id: stableId("evidence", patchDigest, "command", command.id),
      type: "command",
      producer: `command:${command.id}`,
      status: "error",
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
      summary: `${command.description ?? command.id} could not start.`,
      details: error instanceof Error ? error.message : String(error),
      command: redactSecrets(command.run, redactions),
      exitCode: null,
      stdout: "",
      stderr: "",
      relatedFiles: [],
      metadata: { commandId: command.id, required: command.required, launchError: true },
    };
  }
}

function redactionValues(environmentNames: readonly string[]): string[] {
  return environmentNames.flatMap((name) => {
    const value = process.env[name];
    return value === undefined || value.length < 4 ? [] : [value];
  });
}

async function loadVerificationPolicy(
  repository: GitRepository,
  options: VerificationOptions,
  baseCommit: string,
): Promise<{ value: Awaited<ReturnType<typeof loadPolicy>>["value"]; seal: PolicySeal }> {
  const policyPath = resolve(options.cwd, options.policyPath);
  if (options.explicitPolicy) {
    const loaded = await loadPolicy(policyPath);
    return {
      value: loaded.value,
      seal: {
        source: "explicit-file",
        sourceRef: policyPath,
        path: options.policyPath,
        digest: sha256(canonicalJson(loaded.value)),
      },
    };
  }
  const loaded = await loadSealedPolicy(repository, baseCommit, options.policyPath);
  return { value: loaded.value, seal: loaded.seal };
}

export async function verifyPatch(options: VerificationOptions): Promise<ProofBundle> {
  const repository = await GitRepository.discover(options.cwd);
  const repositoryOptions = { ...options, cwd: repository.root };
  const patch = await repository.snapshot(options.baseRef, options.headRef);
  if (options.runCommands) await repository.assertCommandCheckout(patch.headCommit);
  const [{ value: policy, seal }, loadedContract] = await Promise.all([
    loadVerificationPolicy(repository, repositoryOptions, patch.baseCommit),
    loadContract(resolve(repository.root, options.contractPath)),
  ]);
  const contract = loadedContract.value;
  validateContractAgainstPolicy(contract, policy, options.contractPath);
  if (options.expectedContractDigest !== undefined && (
    !/^[a-f\d]{64}$/iu.test(options.expectedContractDigest) ||
    sha256(canonicalJson(contract)) !== options.expectedContractDigest.toLowerCase()
  )) {
    throw new Error("The contract does not match the expected approved digest. No verification commands were executed.");
  }

  const context: AnalyzerContext = {
    patch,
    policy,
    contract,
    getFileAtRef: (ref, path) => repository.getFileAtRef(ref, path),
  };
  options.onProgress?.({ phase: "analysis", status: "started", message: "Analyzing the committed patch against the sealed policy" });
  const analyzerResult = await runAnalyzers(createBuiltinAnalyzers(policy), context);
  options.onProgress?.({ phase: "analysis", status: "completed", message: `${analyzerResult.findings.length} findings from deterministic analysis` });
  const drafts: EvidenceDraft[] = [...analyzerResult.evidence];

  if (options.runCommands) {
    const exactRedactions = redactionValues(policy.redactions);
    const runner = new CommandRunner({ cwd: repository.root, redactions: exactRedactions });
    for (const command of policy.commands) {
      // Catch checkout changes between commands as well as at the boundaries.
      await repository.assertCommandCheckout(patch.headCommit);
      options.onProgress?.({ phase: "command", status: "started", message: `Running ${command.id}` });
      const record = await commandEvidence(runner, command, patch.diffDigest, exactRedactions);
      drafts.push(record);
      options.onProgress?.({ phase: "command", status: "completed", message: `${command.id}: ${record.status} (${record.durationMs} ms)` });
    }
    await repository.assertCommandCheckout(patch.headCommit);
  } else {
    const timestamp = new Date().toISOString();
    for (const command of policy.commands) {
      drafts.push({
        id: stableId("evidence", patch.diffDigest, "command", command.id),
        type: "command",
        producer: `command:${command.id}`,
        status: "skipped",
        startedAt: timestamp,
        completedAt: timestamp,
        durationMs: 0,
        summary: `${command.description ?? command.id} was skipped by the caller.`,
        command: redactSecrets(command.run, redactionValues(policy.redactions)),
        exitCode: null,
        stdout: "",
        stderr: "",
        relatedFiles: [],
        metadata: {
          commandId: command.id,
          required: command.required,
          inheritEnv: [...(command.inheritEnv ?? [])].sort(),
          callerSkipped: true,
        },
      });
    }
  }

  const evidence = sealEvidence(drafts);
  const findings = analyzerResult.findings
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const claims = evaluateClaims(contract.claims, evidence, findings, patch);
  const verdict = computeVerdict(policy, claims, evidence, findings);

  return createProofBundle({
    packageVersion: options.packageVersion,
    patch,
    policy,
    policySeal: seal,
    contract,
    evidence,
    findings,
    claims,
    verdict,
  });
}
