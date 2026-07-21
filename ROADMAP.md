# Roadmap

PatchProof's direction is to make AI-authored patch evidence reproducible, portable, and difficult to weaken while keeping verification local and inspectable. This document describes priorities, not release promises or dates.

## Current foundation: 0.1

Implemented today:

- base/head Git snapshots with full diff capture;
- base-anchored policy and strict claim contracts;
- deterministic safety, test, dependency, scope, and size analyzers;
- clean exact-head command evidence with a safe environment baseline, explicit grants, bounds, and redaction;
- whole-content proof digests, a published JSON Schema, HTML, SARIF, and Ed25519 signatures;
- optional local or explicitly configured contract drafting;
- public TypeScript APIs, a composite GitHub Action, and cross-platform command execution/CI.

The current limitations are intentional and documented: commands are not sandboxed, Git-ignored artifacts can influence builds, contract approval is external, signature identity is external, analyzers are heuristic, and bundle loading does not yet apply the complete published JSON Schema automatically.

## Priority 1: make independent verification boring

- Apply exhaustive top-level runtime validation before rendering, signing, or verifying an imported bundle.
- Provide a small verifier with minimal dependencies and test vectors for canonicalization, evidence chains, and Ed25519 attestations.
- Define compatibility rules for additive fields, schema migrations, and unknown critical fields.
- Add reproducible fixtures that other languages can verify byte for byte.
- Add release attestations and independent package-install/import checks across supported runtimes.

Success means a reviewer can validate a bundle without trusting the full PatchProof generation stack.

## Priority 2: strengthen candidate and contract provenance

- Offer merge-base comparison as an explicit, recorded mode.
- Bind contract provenance to an approved base blob, digest input, or review record.
- Capture relevant toolchain and dependency-lock fingerprints without collecting unnecessary host data.
- Add isolated-worktree execution so Git-ignored caches and artifacts cannot silently influence evidence.

Success means the proof's Git patch, contract, commands, and checkout describe the same candidate by construction.

## Priority 3: stronger trust and CI ergonomics

- Add trusted-key allowlists and policies that require signatures.
- Support external signing providers and protected CI key stores without exporting private key material.
- Define key rotation, revocation, and signer metadata without pretending PatchProof is a public-key infrastructure.
- Add SARIF upload, annotations, artifact retention guidance, and baseline comparisons around the first-party Action.
- Explore interoperable attestations such as in-toto statements and OCI artifacts while preserving standalone JSON inspection.

Success means organizations can state and enforce who may produce accepted proofs.

## Priority 4: safer command execution

- Define a runner interface for container, virtual-machine, and operating-system sandbox adapters.
- Add explicit network policy metadata and enforceable egress profiles.
- Support read-only source mounts and isolated writable build directories.
- Improve process-tree accounting, resource limits, and cancellation across Windows, macOS, and Linux.
- Record sandbox capabilities in evidence so an unsandboxed run cannot be mistaken for a hermetic one.

Success means high-risk repositories can reduce command authority without hiding the remaining boundary.

## Priority 5: deeper deterministic evidence

- Add language-aware test-integrity adapters while retaining transparent heuristic fallbacks.
- Improve inline-test recognition, coverage-delta ingestion, and mutation-test evidence.
- Expand dependency review with lockfile parsers, optional advisory/SBOM inputs, and provenance-aware findings.
- Add configurable secret-detector packs with testable redaction guarantees.
- Support repository-defined analyzers through a narrow, versioned extension API.
- Add performance budgets and changed-surface analysis for large monorepos.

External scanners should contribute declared evidence rather than silently changing verdict semantics.

## Priority 6: better review experience

- Add claim-to-diff and finding-to-evidence navigation.
- Add proof comparison for successive candidate commits.
- Make report accessibility and print/export behavior part of release tests.
- Surface redaction, truncation, skipped evidence, and weak trust modes more prominently.
- Provide concise human review summaries without replacing the JSON source of truth.

## Local-first model direction

Models will remain outside verdict computation. Future model-assisted features may propose contracts, summarize existing deterministic evidence, or suggest missing requirements, but must:

- disclose the exact data sent;
- work with a local provider by default;
- validate all structured output;
- label generated text as advisory;
- preserve an entirely model-free verification path.

## How priorities are chosen

Security boundary fixes and proof reproducibility come before new heuristics or report polish. A proposal is especially useful when it includes:

- a real AI-coding failure mode;
- the adversary and trust assumptions;
- deterministic evidence that can detect the failure;
- expected false positives and false negatives;
- compatibility and proof-format impact;
- a minimal test fixture.

See [Contributing](CONTRIBUTING.md) for the development workflow and [Threat model](docs/threat-model.md) for current boundaries.
