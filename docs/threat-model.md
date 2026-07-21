# Threat model

PatchProof is evidence packaging and policy enforcement for software patches. It raises the cost of claiming that AI-written code is safe without tests or review. It is not a sandbox, malware scanner, identity system, or formal proof of program correctness.

## Security goals

PatchProof aims to let a reviewer answer four questions:

1. Which committed bytes changed between the trusted base and candidate head?
2. Which trusted policy, declared claims, analyzers, and commands were used?
3. What evidence passed, failed, or remained unavailable?
4. Is the complete bundle internally consistent, and if signed, unchanged since the holder of a particular key attested it?

## Protected assets

- integrity of the captured Git diff and its metadata;
- integrity and provenance of the verification policy;
- integrity and order of analyzer and command evidence;
- accuracy of claim and verdict computation under PatchProof's rules;
- confidentiality of secrets that might otherwise appear in captured command output;
- integrity of signing private keys and trusted public-key fingerprints.

## Trust assumptions

A defensible proof assumes all of the following:

- The selected base ref is trusted and contains a reviewed PatchProof policy.
- Policy authors are trusted to define safe commands and meaningful thresholds.
- The PatchProof executable, Node.js runtime, Git executable, operating system, and dependencies are not compromised.
- Command execution is enabled so PatchProof enforces a clean checkout at the candidate head.
- The working-tree contract was reviewed and corresponds to the task.
- Required commands actually test what their names and claims imply.
- Signing private keys are controlled, and verifiers know the expected public-key fingerprint independently of the bundle.

If any assumption is false, hashes can preserve misleading evidence perfectly.

## Actors considered

- A coding agent or contributor attempting to weaken tests, expand scope, add a secret, or evade required commands.
- A contributor who can control the candidate branch and working tree but not the trusted base policy.
- A recipient who receives a bundle over an untrusted channel.
- An accidental operator who verifies a dirty or mismatched checkout.
- A malicious dependency or repository command executed during verification.

A fully compromised verifier host, trusted base branch, or policy author is out of scope.

## Controls and residual risk

| Threat | Control | Residual risk |
| --- | --- | --- |
| Candidate weakens verification policy | Policy is loaded from the base commit; policy file changes are blocking | A compromised base policy or `--trust-working-policy` removes this boundary |
| Candidate changes unrelated/protected files | Allowed, denied, and contract-excluded path rules | Globs are only as strong as their reviewed configuration |
| Candidate deletes or disables tests | Diff heuristics detect test deletion and common skip syntax | Aliases, generated tests, framework-specific syntax, semantic rewrites, and indirect disabling can evade heuristics |
| Candidate replaces precise assertions with weak ones | Common assertion-removal and weakening patterns produce findings | This is regex-based, not AST or mutation testing |
| Source changes without test changes | Source/test path recognition plus policy and contract requirements | A changed test file does not prove meaningful coverage or regression value |
| Credential added to patch | Added-line detectors redact findings and report common secret formats | It is not full-history, entropy, binary, decoded, or whole-tree scanning; the unredacted value remains in the bundled raw diff |
| Risky dependency change | Manifest/lockfile pairing, install hooks, non-registry sources, and Node package deltas are reported | No package download, provenance verification, license resolution, or vulnerability database lookup occurs |
| Bundle edited after creation | A whole-content digest, nested digests, evidence manifests, and recomputed claims/verdict detect inconsistent edits; Ed25519 authenticates the complete content digest | Anyone can recompute an unsigned bundle and its unkeyed digests; signatures still require external key trust |
| Signer impersonation | Key ID and public key are embedded | Embedded keys are self-asserted; PatchProof has no PKI, allowlist, revocation, or identity binding |
| Secret leaks in command output | Named environment redactions, secret-like values in the command environment, and built-in patterns are removed before storage | Redaction is best effort and occurs after a command has already read the secret; it cannot prevent network exfiltration |
| Malicious proof executes code in report | Dynamic values are HTML-escaped and embedded JSON escapes script-sensitive characters | Consumers should still treat reports as untrusted files and keep browsers updated |

## Critical execution boundary

Policy commands are arbitrary shell commands. PatchProof resolves the configured `cwd` and rejects real paths outside the repository, but it does not confine filesystem access performed by the shell command itself. Commands receive a small safe environment baseline, policy `env`, and only host variables explicitly named by `inheritEnv`. They may still:

- read or modify files inside and outside the repository;
- access the network;
- read explicitly inherited credentials or credentials available through files, tools, or platform services;
- install packages or execute repository-controlled build hooks;
- spawn child processes.

Run PatchProof in an ephemeral, least-privilege environment. Remove unrelated credentials, restrict network access externally when appropriate, and review the base policy as executable code. Redaction protects the stored artifact, not the host.

## Git and working-tree boundary

The bundle diff is computed only between resolved commit objects. With command execution enabled, PatchProof rejects a checkout whose `HEAD` differs from the resolved candidate commit or whose Git status contains tracked/untracked changes. It checks this before and after commands, so a command that dirties tracked or ordinary untracked files also stops verification. Analyzer reads use the immutable resolved commit IDs.

`--no-commands` skips these guards. Git-ignored files and external caches also do not make a checkout dirty, yet they can influence a build. Production verification should therefore use a fresh ephemeral checkout, fetch the base ref, check out the exact candidate commit, and use `--head HEAD`.

The comparison is base-to-head, not automatically merge-base-to-head. Select the base deliberately.

## Contract boundary

The contract digest proves which contract is bundled, not when or by whom it was approved. The generated default scope permits `.patchproof/contract.yml` so each candidate can carry a task-specific contract. Clean-checkout enforcement binds it to the candidate commit when commands run, but the candidate can still choose weaker claims.

For high-assurance use, review the contract before implementation and preserve its digest in a trusted issue, approval record, base commit, or CI input. Treat model-drafted contracts as untrusted proposals until a human reviews every claim and evidence requirement.

## Model and network boundary

Models are used only by `patchproof contract`; verification itself is model-free. The contract command sends the task text and optional repository summary to the configured endpoint. It does not automatically send the diff or repository files. If `--task-file` is used, that file's complete contents become task text and are transmitted.

Ollama defaults to loopback. An OpenAI-compatible endpoint may be remote; its operator then receives the supplied text and any bearer token configured through `--api-key-env`. PatchProof does not redact model prompts. Do not submit secrets.

## Bundle verification boundary

`verify-bundle` checks the schema version; full content digest; proof ID; diff digest and derived file statistics; policy/contract schemas, cross-references, and digests; evidence chain; one finding manifest per enabled analyzer; claim and verdict recomputation; duplicate IDs; and optional attestation metadata/signature. Signing refuses a bundle that fails these checks.

It does not run the published JSON Schema automatically, resolve the recorded Git objects, rerun analyzers, or rerun commands. A malicious creator can fabricate a new, internally consistent unsigned bundle and recompute its unkeyed hashes. Even a valid signature proves only that the key holder signed those claims, not that the commands ran honestly or the analyzer findings match an independently reproduced repository.

An unsigned bundle can report `valid` with signature state `unsigned`. Here, `valid` means the implemented consistency checks pass, not that the bundle is authentic or that its `verified` verdict reflects real execution.

## Recommended high-assurance profile

1. Pin PatchProof, Node.js, Git, and dependency versions in an ephemeral runner.
2. Fetch and explicitly select the trusted base commit.
3. Check out the candidate commit with a clean working tree.
4. Review the base policy as executable code and minimize command privileges.
5. Review or externally pin the contract before implementation.
6. Keep `inheritEnv` minimal, avoid credentials in policy `env`, and constrain network/filesystem access outside PatchProof.
7. Run all required commands; do not treat `incomplete` as success.
8. Sign the JSON bundle with a protected key.
9. Verify the bundle and compare its key ID with a fingerprint obtained through a separate trusted channel.
10. Retain the JSON bundle; HTML and SARIF are projections, not the source of truth.

## Non-goals

PatchProof does not currently provide:

- command sandboxing or hermetic builds;
- remote attestation or trusted hardware guarantees;
- signer identity certification or key revocation;
- formal methods, semantic program proof, mutation coverage, or test quality scoring;
- comprehensive secret, malware, license, SBOM, provenance, or CVE scanning;
- protection from a compromised base branch, verifier binary, runtime, or host.

Security vulnerabilities in PatchProof itself should be reported through the process in [SECURITY.md](../SECURITY.md).
