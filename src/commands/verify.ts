import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pc from "picocolors";
import { DEFAULT_CONTRACT_PATH, DEFAULT_POLICY_PATH, DEFAULT_PROOF_DIRECTORY } from "../constants.js";
import { verifyPatch } from "../engine.js";
import { GitRepository } from "../git/index.js";
import {
  proofBundleToSarif,
  renderProofSummary,
  signProofBundle,
  writeProofBundle,
} from "../proof/index.js";
import { renderProofReport } from "../report/index.js";
import { PACKAGE_VERSION } from "../version.js";
import type { VerificationProgress } from "../types.js";

export interface VerifyCommandOptions {
  cwd: string;
  base?: string;
  head: string;
  policy: string;
  contract: string;
  commands: boolean;
  trustWorkingPolicy: boolean;
  output?: string;
  report?: string | boolean;
  sarif?: string;
  signKey?: string;
  summary?: string;
  expectedContractDigest?: string;
  json: boolean;
}

async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function runVerification(options: VerifyCommandOptions): Promise<void> {
  const repository = await GitRepository.discover(resolve(options.cwd));
  const cwd = repository.root;
  const requestedPaths = [options.output, typeof options.report === "string" ? options.report : undefined, options.sarif, options.summary]
    .filter((path): path is string => path !== undefined).map((path) => resolve(cwd, path));
  const pathKey = (path: string): string => process.platform === "win32" ? path.toLowerCase() : path;
  if (new Set(requestedPaths.map(pathKey)).size !== requestedPaths.length) {
    throw new Error("Proof, report, SARIF, and summary output paths must be different.");
  }
  const protectedPaths = [options.policy, options.contract, options.signKey].filter((path): path is string => path !== undefined)
    .map((path) => pathKey(resolve(cwd, path)));
  if (requestedPaths.some((path) => protectedPaths.includes(pathKey(path)))) {
    throw new Error("Output paths must not overwrite the policy, contract, or signing key.");
  }
  const baseRef = options.base ?? (await repository.resolveDefaultBaseRef());
  let bundle = await verifyPatch({
    cwd,
    baseRef,
    headRef: options.head,
    policyPath: options.policy,
    contractPath: options.contract,
    runCommands: options.commands,
    explicitPolicy: options.trustWorkingPolicy,
    packageVersion: PACKAGE_VERSION,
    ...(options.expectedContractDigest !== undefined ? { expectedContractDigest: options.expectedContractDigest } : {}),
    ...(!options.json ? { onProgress: (event: VerificationProgress) => {
      process.stderr.write(`  ${event.message}\n`);
    } } : {}),
  });
  if (options.signKey) {
    bundle = signProofBundle(bundle, await readFile(resolve(cwd, options.signKey), "utf8"));
  }

  const outputPath = resolve(
    cwd,
    options.output ?? `${DEFAULT_PROOF_DIRECTORY}/${bundle.id}.json`,
  );
  await ensureParent(outputPath);
  await writeProofBundle(outputPath, bundle);

  let reportPath: string | null = null;
  if (options.report !== false) {
    reportPath = resolve(
      cwd,
      typeof options.report === "string"
        ? options.report
        : `${DEFAULT_PROOF_DIRECTORY}/${bundle.id}.html`,
    );
    await ensureParent(reportPath);
    await writeFile(reportPath, renderProofReport(bundle), "utf8");
  }

  if (options.sarif) {
    const sarifPath = resolve(cwd, options.sarif);
    await ensureParent(sarifPath);
    await writeFile(sarifPath, `${JSON.stringify(proofBundleToSarif(bundle), null, 2)}\n`, "utf8");
  }
  if (options.summary) {
    const summaryPath = resolve(cwd, options.summary);
    await ensureParent(summaryPath);
    await writeFile(summaryPath, renderProofSummary(bundle), "utf8");
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      id: bundle.id,
      verdict: bundle.verdict,
      proof: outputPath,
      report: reportPath,
      sarif: options.sarif ? resolve(cwd, options.sarif) : null,
      summary: options.summary ? resolve(cwd, options.summary) : null,
    })}\n`);
  } else {
    const verdictColor =
      bundle.verdict.status === "verified"
        ? pc.green
        : bundle.verdict.status === "rejected"
          ? pc.red
          : pc.yellow;
    process.stdout.write(`${pc.bold("PatchProof verdict:")} ${verdictColor(bundle.verdict.status)}\n`);
    process.stdout.write(`  ${bundle.verdict.summary}\n`);
    process.stdout.write(`  claims    ${bundle.verdict.provenClaims}/${bundle.claims.length} proven\n`);
    process.stdout.write(`  findings  ${bundle.verdict.blockingFindings} blocking, ${bundle.verdict.warnings} warnings\n`);
    process.stdout.write(`  proof     ${outputPath}\n`);
    if (reportPath) process.stdout.write(`  report    ${reportPath}\n`);
    if (options.summary) process.stdout.write(`  summary   ${resolve(cwd, options.summary)}\n`);
    for (const finding of bundle.findings.filter((item) => item.severity !== "info").slice(0, 10)) {
      const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, " ");
      const location = finding.location ? ` ${clean(finding.location.path)}${finding.location.line ? `:${finding.location.line}` : ""}` : "";
      process.stdout.write(`\n  ${finding.severity}:${location} ${clean(finding.title)}\n`);
      if (finding.remediation) process.stdout.write(`    Fix: ${clean(finding.remediation)}\n`);
    }
  }

  if (bundle.verdict.status === "rejected" || bundle.verdict.status === "error") {
    process.exitCode = 1;
  } else if (bundle.verdict.status === "incomplete") {
    process.exitCode = 2;
  }
}

export const verifyDefaults = {
  policy: DEFAULT_POLICY_PATH,
  contract: DEFAULT_CONTRACT_PATH,
};
