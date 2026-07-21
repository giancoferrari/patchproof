# Contributing to PatchProof

PatchProof welcomes focused bug fixes, analyzer improvements, tests, documentation, and design proposals. Because it executes repository commands and produces security-relevant evidence, changes should favor explicit behavior, deterministic output, and narrow trust boundaries.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public pull request or issue.

## Development setup

Requirements are Node.js 20.12 or newer and Git.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The single preflight command is:

```sh
npm run check
```

It runs type checking, the full Vitest suite, and the production build. Generate the example JSON bundle and standalone report with:

```sh
npm run demo
```

The generated files appear in `examples/`. Review `examples/patchproof-report.html` in a browser when report rendering changes.

## Repository map

| Path | Area |
| --- | --- |
| `src/analyzers/` | Built-in deterministic rules and diff heuristics |
| `src/config/` | Strict policy/contract parsing and validation |
| `src/git/` | Safe Git invocation, ref resolution, and diff parsing |
| `src/model/` | Optional contract-drafting adapters |
| `src/proof/` | Evidence chain, claims, verdicts, bundle integrity, SARIF |
| `src/report/` | Standalone HTML report |
| `src/runner/` | Shell command execution and redaction |
| `src/commands/` | CLI command implementations |
| `tests/` | Unit and integration tests |
| `docs/` | Architecture and operator documentation |

Read [Architecture](docs/architecture.md) and [Threat model](docs/threat-model.md) before changing a trust boundary.

## Change workflow

1. Open or identify one concrete problem.
2. Add a regression test that fails for that problem when practical.
3. Make the smallest coherent implementation change.
4. Update public types and documentation when behavior changes.
5. Run `npm run check` from a clean checkout.
6. Explain user-visible behavior, security implications, and compatibility impact in the pull request.

Avoid unrelated formatting or generated-file churn. Do not commit private keys, real credentials, private proof bundles, or model prompts containing sensitive repository data.

## Design principles

- **Deterministic verification:** model output must not decide claims or verdicts.
- **Base-anchored authority:** candidate changes must not silently relax trusted policy.
- **Falsifiable claims:** every claim names finite evidence that can fail or remain unproven.
- **Portable inspection:** JSON is the source of truth and can be checked without rerunning commands.
- **Fail closed:** malformed config, unsafe refs/paths, and inconsistent evidence should stop verification.
- **Explicit limitations:** heuristics must document both what they detect and what they miss.
- **Stable automation:** CLI exit codes and machine-readable output should remain intentional.

## Adding or changing an analyzer

An analyzer should be pure relative to its `AnalyzerContext` except for bounded `getFileAtRef` reads. It should not call a model, access the network, mutate the checkout, or execute repository code.

Changes should include tests for:

- a clean patch with passing evidence;
- each new finding and its exact severity;
- false-positive resistance for common benign input;
- added, modified, deleted, and renamed files when relevant;
- path normalization and stable ordering;
- secret-safe descriptions and previews;
- the effect on claims and verdicts when the analyzer is required.

Use stable rule IDs. Finding IDs and fingerprints must derive from semantic inputs, not timestamps or iteration accidents. Explain whether warnings mark rule evidence failed and how a default blocking claim will react.

Register a new configurable public analyzer consistently in types, configuration validation, cross-document mapping, registry, initialization templates, documentation, and tests. The always-on missing-test analyzer is an intentional special case rather than a pattern to copy silently.

## Changing proof integrity or signing

Proof-format changes require extra care. Include tests that mutate every content-digested field, reorder/delete evidence, change finding manifests and chain heads, forge claims/verdicts, replace attestation metadata/signatures, and cover unsigned behavior. Preserve the distinction among:

- internal consistency;
- origin authentication;
- external trust in signer identity;
- reproduction of the underlying Git and command evidence.

Do not label an unsigned bundle authenticated, or an embedded public key trusted. Update [Proof bundle format](docs/proof-bundle.md), the changelog, and the schema version when compatibility requires it.

## Changing command execution

Assume command text and repository content may be hostile. Preserve argument-safe Git execution, immutable commit reads, exact-head/clean-worktree guards, realpath-confined configured working directories, the safe environment baseline, explicit inheritance, timeouts, process-tree termination, bounded output, and redaction before persistence. Tests must cover Windows and POSIX differences where the implementation branches by platform.

PatchProof's runner is not a sandbox. Do not imply isolation unless a future implementation enforces it at the operating-system boundary.

## Documentation and examples

Examples must use options the current CLI accepts and clearly distinguish current behavior from proposed work. Do not publish real keys, tokens, domains presented as live services, or abbreviated code that cannot execute in its stated context.

Check relative Markdown links and run CLI help for any command you changed:

```sh
node dist/cli.js --help
node dist/cli.js verify --help
node dist/cli.js contract --help
```

## Pull-request review

A pull request is ready for review when:

- `npm run check` passes;
- new behavior has proportional tests;
- documentation reflects observable behavior;
- security and privacy effects are stated;
- generated or dependency changes are intentional;
- the change does not weaken a trust boundary without explicit design discussion.

Maintainers may ask to split policy, proof-format, UI, or dependency changes so each can be reviewed independently.
