import { Command, CommanderError, Option } from "commander";
import pc from "picocolors";
import {
  compareBundles,
  generateContract,
  generateKeys,
  generateReport,
  initializePatchProof,
  runDoctor,
  runVerification,
  signBundle,
  verifyBundleCommand,
  verifyDefaults,
} from "./commands/index.js";
import { DEFAULT_CONTRACT_PATH, DEFAULT_REPORT_NAME } from "./constants.js";
import type { ModelPolicy } from "./types.js";
import type { BundleVerificationOptions } from "./proof/bundle.js";
import type { CompareOptions } from "./commands/compare.js";
import type { DoctorOptions } from "./commands/doctor.js";
import { PACKAGE_VERSION } from "./version.js";

interface GlobalOptions {
  cwd: string;
}

function cwdFrom(command: Command): string {
  return (command.optsWithGlobals() as GlobalOptions).cwd;
}

const program = new Command();
program
  .name("patchproof")
  .description("Independent, inspectable evidence for AI-written code.")
  .version(PACKAGE_VERSION)
  .option("-C, --cwd <directory>", "repository or working directory", process.cwd())
  .showHelpAfterError()
  .exitOverride();

program
  .command("init")
  .description("Create a policy and claim contract for this repository")
  .option("--force", "replace existing PatchProof configuration", false)
  .option("--quiet", "suppress human-readable output", false)
  .action(async (options: { force: boolean; quiet: boolean }, command: Command) => {
    await initializePatchProof({ cwd: cwdFrom(command), ...options });
  });

program
  .command("verify")
  .description("Verify a patch against sealed policy and falsifiable claims")
  .option("--base <ref>", "trusted base Git ref; defaults to upstream or main")
  .option("--head <ref>", "candidate Git ref", "HEAD")
  .option("--policy <path>", "policy path relative to the repository", verifyDefaults.policy)
  .option("--contract <path>", "contract path relative to the repository", verifyDefaults.contract)
  .option("--no-commands", "skip configured commands and mark their evidence as skipped")
  .option("--trust-working-policy", "explicitly trust the working-tree policy instead of the base-commit copy", false)
  .option("--output <file>", "proof bundle output path")
  .option("--report <file>", "standalone HTML report output path")
  .option("--no-report", "do not generate an HTML report")
  .option("--sarif <file>", "write SARIF 2.1.0 findings")
  .option("--summary <file>", "write a Markdown review summary with findings and fixes")
  .option("--expected-contract-digest <sha256>", "require a reviewed contract digest before running commands")
  .option("--sign-key <file>", "sign the proof with an Ed25519 private key")
  .option("--json", "print one machine-readable result object", false)
  .action(
    async (
      options: {
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
      },
      command: Command,
    ) => {
      await runVerification({ cwd: cwdFrom(command), ...options });
    },
  );

program
  .command("compare")
  .description("Compare validated proofs for new findings, resolved findings, and regressions")
  .argument("<baseline>", "previous proof JSON")
  .argument("<candidate>", "new proof JSON")
  .option("--json", "print a machine-readable comparison")
  .option("-o, --output <file>", "also save the comparison to a file")
  .option("--fail-on-regression", "exit 1 for regressions, 2 when verification bases differ")
  .action(async (baseline: string, candidate: string, options: CompareOptions, command: Command) => {
    await compareBundles(baseline, candidate, cwdFrom(command), options);
  });

program
  .command("report")
  .description("Render a validated proof as standalone HTML or a Markdown review summary")
  .argument("<proof>", "proof bundle JSON")
  .option("-o, --output <file>", "HTML output path", DEFAULT_REPORT_NAME)
  .addOption(new Option("--format <format>", "report format").choices(["html", "markdown"]).default("html"))
  .action(async (proof: string, options: { output: string; format: "html" | "markdown" }, command: Command) => {
    const output = options.format === "markdown" && command.getOptionValueSource("output") === "default" ? "patchproof-summary.md" : options.output;
    await generateReport(proof, output, cwdFrom(command), options.format);
  });

program
  .command("keygen")
  .description("Generate a local Ed25519 signing key pair")
  .option("--private <file>", "private key output", ".patchproof/keys/patchproof-private.pem")
  .option("--public <file>", "public key output", ".patchproof/keys/patchproof-public.pem")
  .option("--force", "replace an existing key pair", false)
  .action(
    async (
      options: { private: string; public: string; force: boolean },
      command: Command,
    ) => {
      await generateKeys(options.private, options.public, cwdFrom(command), options.force);
    },
  );

program
  .command("sign")
  .description("Attach an Ed25519 attestation to a proof bundle")
  .argument("<proof>", "input proof bundle JSON")
  .requiredOption("--key <file>", "private signing key")
  .requiredOption("-o, --output <file>", "signed proof output")
  .action(
    async (
      proof: string,
      options: { key: string; output: string },
      command: Command,
    ) => {
      await signBundle(proof, options.key, options.output, cwdFrom(command));
    },
  );

program
  .command("verify-bundle")
  .description("Check proof digests, evidence chain, and optional signature")
  .argument("<proof>", "proof bundle JSON")
  .option("--json", "print one machine-readable result object", false)
  .option("--require-signature", "reject unsigned proofs")
  .option("--trusted-key <file>", "require a trusted Ed25519 public key (repeat for key rotation)", (value: string, previous: string[] = []) => [...previous, value])
  .option("--expected-head <commit>", "require this full candidate commit hash")
  .option("--expected-base <commit>", "require this full base commit hash")
  .option("--expected-contract-digest <sha256>", "require this reviewed contract digest")
  .option("--require-base-policy", "reject policies supplied by the candidate checkout")
  .option("--require-verified", "require the proof verdict to be verified")
  .action(async (proof: string, options: { json: boolean } & BundleVerificationOptions & { trustedKey?: string[] }, command: Command) => {
    await verifyBundleCommand(proof, cwdFrom(command), options.json, options);
  });

program
  .command("contract")
  .description("Draft a claim contract with a local or explicitly configured model")
  .addOption(
    new Option("--provider <provider>", "model provider")
      .choices(["ollama", "openai-compatible"])
      .makeOptionMandatory(),
  )
  .requiredOption("--model <name>", "model name")
  .option("--endpoint <url>", "provider base URL")
  .option("--api-key-env <name>", "environment variable containing an API key")
  .option("--task <text>", "task description")
  .option("--task-file <file>", "file containing the task description")
  .option("--repository-summary <text>", "small, non-secret repository context summary")
  .option("-o, --output <file>", "contract YAML output", DEFAULT_CONTRACT_PATH)
  .action(
    async (
      options: {
        provider: ModelPolicy["provider"];
        model: string;
        endpoint?: string;
        apiKeyEnv?: string;
        task?: string;
        taskFile?: string;
        repositorySummary?: string;
        output: string;
      },
      command: Command,
    ) => {
      await generateContract({ cwd: cwdFrom(command), ...options });
    },
  );

program
  .command("doctor")
  .description("Check Git, Node.js, policy, and contract readiness")
  .option("--json", "print machine-readable checks and suggested fixes")
  .option("--preflight", "also check comparison refs, trusted policy, and command checkout")
  .option("--base <ref>", "trusted base Git ref; enables verification preflight")
  .option("--head <ref>", "candidate Git ref", "HEAD")
  .option("--policy <path>", "repository-relative policy path", verifyDefaults.policy)
  .option("--contract <path>", "repository-relative contract path", verifyDefaults.contract)
  .action(async (options: DoctorOptions, command: Command) => {
    await runDoctor(cwdFrom(command), options);
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
      process.exitCode = 0;
    } else {
      process.exitCode = error.exitCode || 1;
    }
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${pc.red("PatchProof error:")} ${message}\n`);
    if (process.env["PATCHPROOF_DEBUG"] === "1" && error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exitCode = 1;
  }
}
