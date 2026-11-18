# CLI and integration guide

Use this guide to configure a repository, save verification results, sign a bundle, or run PatchProof in CI. For a first review, start with the [quickstart](../README.md#quickstart). For comparing candidates and verifying a received bundle against Git, see [advanced review workflows](advanced-workflows.md).

## Requirements

- Node.js 20.12 or newer to run the packaged CLI. Use Node.js 22.12 or newer for development.
- Git available on `PATH`
- A Git repository with a committed PatchProof policy at the selected base ref

## Installation

From a local checkout of the PatchProof repository, run the following commands. Installing development dependencies builds the CLI through the package's `prepare` script.

```sh
npm ci
npm install --global .
patchproof --version
```

For a project-local installation of the [v0.1.0 release](https://github.com/giancoferrari/patchproof/releases/tag/v0.1.0), run the following commands in the project you want to review.

```sh
npm install --save-dev https://github.com/giancoferrari/patchproof/releases/download/v0.1.0/giancoferrari-patchproof-0.1.0.tgz
npx patchproof --version
```

The package name is `@giancoferrari/patchproof` and the executable is `patchproof`. Use `npx patchproof` for the project-local installation. The examples below use the current checkout. Candidate comparison, preflight with `doctor --base`, and Git-backed bundle verification are available on `main`.

## What verification checks

| Check | Evidence in the report |
| --- | --- |
| Policy and scope | The policy read from the base commit, changes to that policy, paths outside the declared scope, and changes above the configured size limits. |
| Tests | Removed, skipped, or weakened tests that match the configured rules. Source changes can also require a qualifying test change. |
| Dependencies and credentials | Changes to dependency manifests and lockfiles, plus supported credential patterns in added text. |
| Commands and claims | Exit status and output from the configured commands, the commit they ran against, and the evidence that supports or disproves each claim. |

When you receive someone else’s proof, `verify-bundle` checks the schema, evidence chain, and internal consistency. You can also require a trusted signer, specific commits, an approved contract, and a verified verdict. [Bundle acceptance options](advanced-workflows.md#3-enforce-who-signed-a-proof-and-what-it-describes).

## Verification output

By default, PatchProof writes the bundle and offline report to `.patchproof/proofs/`.

- The JSON bundle records the evidence under its generated proof ID.
- The HTML report uses the same proof ID and opens offline in a browser.
- Pass `--sarif PATH` to write findings in SARIF 2.1.0 format.

Use explicit paths when another tool needs stable filenames.

```sh
patchproof verify --base main --head HEAD \
  --output .patchproof/proofs/review.json \
  --report .patchproof/proofs/review.html \
  --sarif .patchproof/proofs/review.sarif \
  --json
```

Automation can use the exit code from `patchproof verify` to decide whether to proceed.

| Code | Meaning |
| ---: | --- |
| `0` | Verified patch |
| `1` | `rejected`, a verification error, or invalid CLI usage |
| `2` | `incomplete`: no blocking failure, but required evidence is missing or skipped |

### Evidence is bound to the checkout

PatchProof compares committed refs. Before and after running commands, it checks that the checkout is clean and that `HEAD` matches the candidate commit. A mismatch stops verification.

```sh
git status --porcelain
git rev-parse HEAD
patchproof verify --base main --head HEAD
```

The first command should print nothing, and `HEAD` must be the commit being verified. `--no-commands` intentionally skips these checkout guards along with command execution.

## Policy and contract

`patchproof init` detects common `package.json` scripts and creates two YAML files.

- `.patchproof/policy.yml` defines trusted commands, explicit environment inheritance, scope, thresholds, analyzers, and names of environment variables whose values must be redacted. Verification reads it from the base commit by default.
- `.patchproof/contract.yml` defines falsifiable claims and the exact command, rule, path, or test-change evidence required for each claim.

Unknown fields, duplicate identifiers, disabled-rule references, and unknown command references are rejected. Read [Policies and contracts](policies-and-contracts.md) for complete schemas and examples.

## Commands

| Command | Purpose |
| --- | --- |
| `patchproof init` | Create policy, contract, and ignore entries without replacing existing configuration |
| `patchproof doctor` | Check Node.js, Git, and configuration readiness |
| `patchproof doctor --base REF` | Preflight trusted policy, contract references, comparison refs, and command checkout |
| `patchproof verify` | Build a proof from a committed base/head comparison |
| `patchproof report PROOF_FILE` | Render an internally consistent bundle as standalone HTML |
| `patchproof keygen` | Create a local Ed25519 key pair |
| `patchproof sign PROOF_FILE` | Sign an existing bundle |
| `patchproof verify-bundle PROOF_FILE` | Check digests, the evidence chain, and any embedded signature |
| `patchproof compare BEFORE AFTER` | Compare findings, claim support, commands, and verdicts; optionally gate regressions |
| `patchproof contract` | Draft a contract through Ollama or an explicit OpenAI-compatible endpoint |

Run `patchproof COMMAND --help` for all options.

### Skip command execution

```sh
patchproof verify --base main --no-commands
```

Configured commands are recorded as `skipped`. Skipping a required command leaves the verdict `incomplete` unless a blocking failure already makes it `rejected`.

### Working-tree policy escape hatch

```sh
patchproof verify --base main --trust-working-policy
```

This changes the policy seal source to `explicit-file`. It is intentionally weaker because the candidate checkout controls the policy. Use it for policy development, not as equivalent evidence to a base-anchored policy.

## Sign and verify a bundle

```sh
patchproof keygen
patchproof verify --base main \
  --output .patchproof/proofs/patchproof.signed.json \
  --report .patchproof/proofs/patchproof.signed.html \
  --sign-key .patchproof/keys/patchproof-private.pem
patchproof verify-bundle .patchproof/proofs/patchproof.signed.json
```

The private-key directory is added to `.gitignore` by `patchproof init`. Every bundle has a whole-content digest and recomputable consistency checks. A valid embedded signature additionally proves that the complete bundle was attested by possession of that key; consumers must still obtain the expected public-key fingerprint through a trusted channel. Details are in [Proof bundles](proof-bundle.md).

## GitHub Action

The example uses the tagged v0.1.0 action and fetches enough history to resolve the trusted base.

```yaml
name: PatchProof
on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: false
      - id: patchproof
        uses: giancoferrari/patchproof@v0.1.0
        with:
          base-ref: origin/main
          head-ref: HEAD
          setup-command: npm ci --ignore-scripts --no-audit --no-fund
          proof-path: .patchproof/proofs/patchproof.json
          report-path: .patchproof/proofs/patchproof.html
          sarif-path: .patchproof/proofs/patchproof.sarif
```

The action builds the tagged PatchProof source, optionally runs the trusted `setup-command` in the target checkout, then runs the same CLI. It exposes `proof-path`, `report-path`, and `sarif-path` outputs. The example installs the target repository's Node dependencies without lifecycle scripts; use an equivalent preparation command for other ecosystems. Its checkout must be clean when configured commands start.

## Optional local contract drafting

After starting Ollama and installing a model, use the task and repository summary to draft a contract.

```sh
patchproof contract \
  --provider ollama \
  --model qwen2.5-coder:7b \
  --task "Reject profile updates that reuse any of the last five passwords" \
  --repository-summary "Node.js service; npm test runs Vitest; tests live under tests" \
  --output .patchproof/contract.yml
```

Review the generated contract before implementation. The model proposes claims; it never supplies verification evidence. See [Local models](local-models.md).

## Programmatic API

```ts
import { PACKAGE_VERSION, verifyPatch, verifyProofBundle } from "@giancoferrari/patchproof";

const bundle = await verifyPatch({
  cwd: process.cwd(),
  baseRef: "origin/main",
  headRef: "HEAD",
  policyPath: ".patchproof/policy.yml",
  contractPath: ".patchproof/contract.yml",
  runCommands: true,
  explicitPolicy: false,
  packageVersion: PACKAGE_VERSION,
});

console.log(bundle.verdict.status);
console.log(verifyProofBundle(bundle));
```

The public API also exports the Git adapter, analyzers, configuration validators, command runner, report renderer, SARIF converter, canonicalization utilities, and signing primitives.
