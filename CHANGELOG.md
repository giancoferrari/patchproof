# Changelog

Notable user-visible changes are recorded here. PatchProof follows semantic versioning while pre-1.0 APIs and proof semantics are still evolving.

## Unreleased

- `policy-integrity` now blocks patches that change the `package.json` scripts a policy command runs, including nested scripts and `pre`/`post` hooks. Previously a patch could replace `npm test` with a script that always exits 0 and still verify. Changes to a policy command's test runner configuration are shown as review warnings.
- New PatchProof identity and report design. The two-sheet logo and wordmark ship as SVG in `docs/assets/brand/`. The report now has an editorial layout: a top navigation bar, a split hero, numbered sections with sticky headings, and a closing colophon. A grain band tinted by the verdict opens and closes the page. The report remains a single offline file. See `DESIGN.md`.
- The offline report now opens with the verdict, ranked findings, suggested fixes, and a source excerpt for a blocking finding when available. Reviewers can filter changed paths and inspect numbered Git hunks with links from findings.
- `verify-bundle --repository <directory>` checks the diff, trusted base policy, and candidate contract against local Git objects. The command works from a dirty or unrelated checkout of the repository.
- Updated the runtime matcher and validator, removed an unused glob dependency, and upgraded the test runner. CI exercises the packaged CLI on its minimum supported Node version.

### Trust and correctness

- Validate imported bundles against the complete published JSON Schema before use, preserving the original signed content.
- Accept unknown input safely in `verifyProofBundle`; report malformed files as structured failures in `verify-bundle --json`.
- Add trusted Ed25519 public-key allowlists, signature requirements, full expected commit hashes, approved contract digests, base-policy requirements, and verified-verdict requirements.
- Reject contradictory command exit evidence, command identities/requirements, duplicate command records, and base-policy seal refs.
- Check an approved contract digest before running commands and check checkout integrity between commands.

### Review workflow

- Add `compare` with new/resolved/persistent/escalated findings, claim and command transitions, and an optional regression gate. Changed verification bases exit as inconclusive.
- Add Markdown reports and verification summaries with findings, remediation, trust context, and bounded lists.
- Add CLI verification progress and actionable finding output.
- Add `doctor --base`/`--preflight`, JSON diagnostics, suggested fixes, and the canonical contract digest.
- Add GitHub Action review summaries and verdict outputs, including rejected/incomplete runs, plus approved-contract input.
- Prevent explicit output collisions with other artifacts, configuration, signing keys, and report/comparison input proofs.

Proof schema remains `1.0`; old schema-conforming bundles remain readable, subject to stricter consistency checks.

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
