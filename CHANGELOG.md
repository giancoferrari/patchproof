# Changelog

Notable user-visible changes are recorded here. PatchProof follows semantic versioning while pre-1.0 APIs and proof semantics are still evolving.

## 0.1.0 - 2026-07-21

Initial public implementation.

### Verification

- Added committed Git base/head snapshots with binary diffs, rename/copy handling, resolved commit IDs, immutable analyzer reads, per-file patches, and aggregate statistics.
- Added base-commit policy sealing and an explicit working-policy trust mode.
- Added strict policy and contract YAML validation with duplicate-key, duplicate-ID, unsafe-path, and cross-document reference checks.
- Added deterministic analyzers for policy integrity, test integrity, added-line secret detection, dependency structure, scope, diff size, and missing test changes.
- Added sequential required/optional command evidence with exact-head/clean-worktree guards before and after execution.
- Added a safe command-environment baseline, explicit `inheritEnv` grants, realpath-confined working directories, timeouts, process-tree termination, bounded output, and runtime environment-value redaction.
- Added falsifiable claim evaluation and `verified`, `rejected`, and `incomplete` verdict computation.

### Evidence and interoperability

- Added portable proof schema `1.0`, a published JSON Schema, whole-content digest, raw patch, normalized configuration, findings, claims, verdict, and linked SHA-256 evidence.
- Added semantic bundle checks that reconstruct patch statistics, analyzer finding manifests, claims, and verdicts before rendering or signing.
- Added Ed25519 key generation and signatures that authenticate the content digest plus attestation algorithm, key, key ID, and timestamp.
- Added standalone offline HTML reports with escaped untrusted values.
- Added SARIF 2.1.0 finding export.
- Added machine-readable verification and bundle-check output plus stable verdict exit codes.

### Local-first AI

- Added optional contract drafting through Ollama, defaulting to the loopback endpoint.
- Added an explicitly configured OpenAI-compatible chat-completions adapter with optional bearer authentication.
- Kept models outside the verification and verdict path; generated contracts must pass the same strict schema as hand-authored contracts.

### Developer experience

- Added repository initialization with package-script detection and conservative configuration templates.
- Added readiness diagnostics, programmatic exports, unit/integration tests, and a generated demonstration report.
- Added the `@giancoferrari/patchproof` package identity, a versioned composite GitHub Action, multi-platform CI, CodeQL, Dependabot, and package smoke testing.
