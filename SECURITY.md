# Security policy

PatchProof processes untrusted repositories, executes policy-defined shell commands, captures source diffs and command output, and creates signed evidence. Security reports are taken seriously.

## Supported versions

| Version | Security fixes |
| --- | --- |
| `0.1.x` | Supported |
| Earlier or unreleased builds | Not supported |

Only the latest patch release in a supported line receives fixes. Because the project is pre-1.0, security hardening may require behavior changes.

## Report a vulnerability

Use GitHub private vulnerability reporting on this repository when it is available. Include:

- affected PatchProof version, Node.js version, operating system, and Git version;
- the command or public API involved;
- a minimal reproduction or malformed artifact;
- the security impact and attacker prerequisites;
- whether the issue has been disclosed elsewhere.

If private reporting is unavailable, open a public issue titled `Security contact request` without exploit details, secrets, or a proof of concept. A maintainer can then establish a private channel. Do not report exploitable details in a public issue.

Maintainers will acknowledge and triage reports on a best-effort basis, coordinate a fix and release when confirmed, and credit reporters who want attribution. No fixed response-time guarantee is currently offered.

## In-scope examples

- policy-seal or signature verification bypass;
- evidence-chain tampering accepted as valid;
- path/ref injection that changes the intended Git operation;
- command `cwd` escape caused by PatchProof's path handling;
- secrets exposed despite a documented supported redaction path;
- HTML report script injection from bundle-controlled values;
- unsafe key-file handling or accidental private-key inclusion;
- model adapter behavior that transmits data beyond the documented request;
- denial of service that bypasses implemented input, output, or timeout bounds.

Reports about analyzer false negatives are welcome when they contradict documented behavior. A heuristic not detecting a class it never claims to cover is normally a feature request rather than a vulnerability.

## Explicit security boundaries

PatchProof commands are **not sandboxed**. A trusted base policy may intentionally run arbitrary shell commands with a safe environment baseline, explicit `inheritEnv` grants, and the verifier's network/filesystem permissions. A malicious repository can also influence tools invoked by those commands. Run verification in an ephemeral least-privilege environment.

Other important boundaries:

- With commands enabled, the current checkout must be clean and at the exact candidate head before and after execution. `--no-commands` skips this guard, and Git-ignored artifacts can still influence tools.
- Secret scanning examines supported patterns on added text lines, not the entire repository or history. Detected values remain in the bundled raw diff even though findings redact them.
- Dependency review is structural and does not query advisories or verify downloaded packages.
- Test-integrity analysis is heuristic and does not prove coverage or correctness.
- An embedded signing key is self-asserted; recipients need an independent trusted fingerprint.
- `verify-bundle` checks the whole-content digest, reconstructs key derived fields, and verifies signatures, but does not rerun Git, analyzers, or commands.
- An unsigned bundle may be internally `valid` without being authentic; an attacker can fabricate a new consistent bundle and recompute unkeyed hashes.

These are documented in detail in [the threat model](docs/threat-model.md). Reports that demonstrate an implementation escaping these stated boundaries are in scope.

## Secure operation

For sensitive repositories:

1. Pin PatchProof and its runtime dependencies.
2. Verify from a clean checkout at the candidate commit.
3. Review the base policy as executable code.
4. Keep command `inheritEnv` grants minimal and use short-lived credentials.
5. Constrain network and filesystem access outside PatchProof.
6. Review the contract before implementation.
7. Require command execution and reject `incomplete` results.
8. Protect signing keys outside the repository and compare trusted key fingerprints out of band.
9. Inspect the JSON bundle before sharing it; it contains the full unredacted diff, normalized policy, and captured output.

## Handling proof artifacts

`.patchproof/proofs/`, `.patchproof/keys/`, and `.patchproof/tmp/` are added to `.gitignore` by `patchproof init`. This reduces accidental commits but is not access control. Store private keys in a dedicated secret manager or protected CI facility, limit proof retention to project policy, and remember that HTML reports embed the same sensitive bundle data. Do not put credentials in static policy `env`; use `redactions` for environment-variable names, whose values are resolved only at runtime.
