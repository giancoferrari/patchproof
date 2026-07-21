import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pc from "picocolors";
import { DEFAULT_CONTRACT_PATH, DEFAULT_POLICY_PATH, DEFAULT_PROOF_DIRECTORY } from "../constants.js";
import { verifyPatch } from "../engine.js";
import { GitRepository } from "../git/index.js";
import {
  proofBundleToSarif,
  signProofBundle,
  writeProofBundle,
} from "../proof/index.js";
import { renderProofReport } from "../report/index.js";
import { PACKAGE_VERSION } from "../version.js";

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
  json: boolean;
}

async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function runVerification(options: VerifyCommandOptions): Promise<void> {
  const repository = await GitRepository.discover(resolve(options.cwd));
  const cwd = repository.root;
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

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      id: bundle.id,
      verdict: bundle.verdict,
      proof: outputPath,
      report: reportPath,
      sarif: options.sarif ? resolve(cwd, options.sarif) : null,
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
