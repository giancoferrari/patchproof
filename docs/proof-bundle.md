# Proof bundle format

The JSON proof bundle is PatchProof's source-of-truth artifact. HTML reports and SARIF files are derived views. Version `0.1.0` emits proof schema `1.0`; its machine-readable definition is [proof-bundle.schema.json](../schemas/proof-bundle.schema.json).

## Top-level structure

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Proof format version, currently `1.0` |
| `id` | Stable-prefix proof identifier derived from base commit, head commit, and creation time |
| `createdAt` | ISO 8601 creation time |
| `generator` | PatchProof, package version, Node.js version, and platform |
| `patch` | Refs, resolved commits, raw binary-aware diff, files, statistics, and diff digest |
| `policy` | Parsed policy plus its source, path, source ref, and canonical digest |
| `contract` | Parsed claim contract and canonical digest |
| `evidence` | Ordered analyzer and command records linked by SHA-256 |
| `findings` | Stable findings with rule, severity, location, fingerprint, and remediation |
| `claims` | Contract claims augmented with status, linked evidence/findings, and explanation |
| `verdict` | Overall status and aggregate counters |
| `chainDigest` | Digest of the final evidence record, or the defined empty-chain digest |
| `contentDigest` | SHA-256 commitment to every content field other than itself and `attestation` |
| `attestation` | Optional Ed25519 public key, key ID, signature, signed digest, and time |

## Patch commitment

`patch.diff` contains the exact Git diff used by analyzers. Its commitment is:

```text
patch.diffDigest = SHA-256(UTF-8 bytes of patch.diff)
```

The snapshot also records user-supplied `baseRef` and `headRef` plus their resolved commit IDs. Verifiers should reason from the commit IDs because branch names can move.

The diff includes binary patch material and full object IDs, subject to a 256 MiB Git-output limit. Individual file-at-ref reads used by analyzers are limited to 64 MiB.

## Policy and contract commitments

PatchProof parses YAML into strict normalized objects and hashes deterministic JSON with object keys sorted by UTF-16 order. For values PatchProof produces, its canonicalizer follows the relevant JSON representation rules used by RFC 8785 and rejects non-finite numbers, circular structures, and unsupported object types.

```text
policy.seal.digest = SHA-256(canonical JSON of policy.value)
contract.digest     = SHA-256(canonical JSON of contract.value)
```

The policy seal additionally records `source`:

- `base-commit`: `sourceRef` is the resolved base commit and the policy is trust-anchored there.
- `explicit-file`: `sourceRef` is the resolved local path selected by `--trust-working-policy`.

The digest commits to the normalized value, not YAML comments, whitespace, key order, or scalar style.

## Evidence chain

Every record contains:

- identity and type (`command`, `rule`, `artifact`, `human`, or `model` in the public type);
- producer and status (`passed`, `failed`, `skipped`, or `error`);
- start, completion, and duration;
- summary and optional details;
- optional command, exit code, stdout, and stderr;
- related files and structured metadata;
- `previousDigest` and `digest`.

The current engine produces `rule` and `command` evidence. For record `i`:

```text
record[i].previousDigest = null                       when i = 0
record[i].previousDigest = record[i - 1].digest      otherwise
record[i].digest = SHA-256(canonical JSON of record[i] without digest)
```

`chainDigest` equals the last record's digest. An empty chain uses `SHA-256("patchproof:empty-evidence-chain")`.

Analyzer evidence additionally carries its analyzer ID, sorted finding IDs, and a digest of those findings. This lets bundle verification detect a missing/replaced finding and confirm that rule status agrees with finding severities.

The evidence chain detects editing, deletion, insertion, or reordering when its hashes are not recomputed. It does not encrypt evidence or prove who created an unsigned chain.

## Claim evaluation

A contract claim may require any combination of:

| Requirement | Proven when |
| --- | --- |
| `commands` | Each named command has passing evidence |
| `rules` | Each named analyzer emitted passing evidence |
| `paths` | At least one changed file matches each listed glob |
| `requireTestChange` | Patch statistics identify at least one changed test file |

Requirements are conjunctive. Command failure/error or failed rule evidence makes the claim `disproven`; absent or skipped evidence makes it `unproven`; all requirements passing makes it `proven`. A claim with no requirements is `unproven`.

`paths` is an existence requirement, not an allowlist. Use policy `scope` and contract `outOfScope` to restrict where changes may occur.

## Verdict rules

Verdict calculation is deterministic and ordered:

| Verdict | Condition |
| --- | --- |
| `rejected` | Any blocking finding, any required command failed/errored, or any blocking claim was disproven |
| `incomplete` | No rejection, but not all required commands passed, or any claim is disproven/unproven |
| `verified` | Neither rejection nor incomplete conditions apply |

Warnings do not directly reject a patch. However, any warning makes its analyzer evidence `failed`; if a blocking claim requires that analyzer, the claim is disproven and the verdict becomes `rejected`. A disproven nonblocking claim produces `incomplete`.

The `error` verdict exists in the public type, but the current engine normally reports execution failures as evidence `error`, which leads to `rejected` when required.

## Whole-content commitment

PatchProof canonicalizes all bundle content except `contentDigest` and `attestation`:

```text
content = bundle without contentDigest and attestation
contentDigest = SHA-256(canonical JSON of content)
```

This covers the patch, configuration, evidence, findings, evaluated claims, verdict, generator metadata, ID, and timestamps. Because the digest is unkeyed and stored beside the content, anyone can fabricate a different unsigned bundle and recompute it. It is an internal consistency commitment, not authentication.

## Signing

PatchProof generates Ed25519 keys in PKCS#8 private PEM and SPKI public PEM formats. Signing first refuses a bundle that fails verification, removes any previous attestation, and signs the canonical attestation metadata:

```text
signedDigest = contentDigest
keyId = first 16 hex characters of SHA-256(public PEM)
signed fields = { algorithm, publicKey, signedDigest, createdAt, keyId }
signature = Ed25519-sign(privateKey, canonical JSON of signed fields)
```

Create and verify a fixed-path signed artifact:

```sh
patchproof keygen
patchproof verify --base main \
  --output patchproof.json \
  --no-report \
  --sign-key .patchproof/keys/patchproof-private.pem
patchproof verify-bundle patchproof.json --json
```

A successful result for a signed bundle has the shape:

```json
{"valid":true,"errors":[],"signature":"valid"}
```

For an unsigned bundle that passes consistency checks, `valid` is also `true` and `signature` is `unsigned`. Consumers who require authenticated provenance must reject unsigned bundles themselves and compare `attestation.keyId` or the full public key with an out-of-band trust record.

To sign an existing bundle without rerunning verification:

```sh
patchproof sign patchproof.json \
  --key .patchproof/keys/patchproof-private.pem \
  --output patchproof.signed.json
patchproof verify-bundle patchproof.signed.json
```

## Independent inspection

`patchproof verify-bundle` checks:

1. supported schema version;
2. proof ID against commit IDs and creation time;
3. raw diff digest, parsed file list, and aggregate statistics;
4. policy/contract schemas, cross-references, and canonical digests;
5. every evidence link, digest, and chain head;
6. one finding manifest and consistent status per enabled analyzer;
7. evaluated claims and verdict recomputed from bundled inputs;
8. duplicate evidence, finding, and claim IDs;
9. whole-content digest;
10. attestation algorithm, timestamp, key ID, signed digest, and Ed25519 signature when present.

It does not resolve the recorded Git objects, reproduce the diff from a repository, rerun analyzers or commands, establish key identity, or automatically validate the complete JSON document with the published JSON Schema. A malicious creator can fabricate a self-consistent unsigned bundle; a signer can attest misleading but internally consistent evidence. A recipient should reproduce high-value evidence and establish signer trust rather than treating `valid: true` as a complete security decision.

## Portability and privacy

The bundle intentionally includes the complete diff and captured command output. It may contain proprietary code, absolute paths, usernames, build metadata, or secrets. Secret-scan findings redact matched values, but the raw diff remains unchanged and therefore still contains any credential added by the patch. Review the JSON before sharing it outside the repository's trust boundary.

HTML reports embed the bundle and are not a privacy-reduced format. SARIF contains findings and proof metadata but is not a replacement for the JSON bundle.
