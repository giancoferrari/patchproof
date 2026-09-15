# Review, trust, and regression workflows

These commands are available in the current checkout. Build it with `npm ci` and `npm run build`; use `node dist/cli.js` in place of `patchproof` if it is not installed globally. The published `v0.1.0` release does not include these additions.

## 1. Check readiness before spending time on a verification run

```sh
patchproof doctor --base main --json
```

Doctor checks the runtime, repository, configuration, resolved comparison, policy at the trusted base, contract references against that policy, and clean checkout at the candidate head. It does not execute repository commands or modify files. Every failed check includes a suggested fix. Exit `0` means the checks passed; exit `1` means at least one failed. Warnings identify gaps such as no required commands or identical base/head commits.

Without `--base` or `--preflight`, doctor performs configuration checks only. Use `--policy` and `--contract` for custom paths. Paths resolve from the repository root, including when invoked from a subdirectory.

## 2. Pin requirements that were reviewed before implementation

Doctor emits `contractDigest`, the SHA-256 digest of canonical, validated contract JSON. Capture it **after reviewing the contract**, and store it in a trusted CI setting or approval record. Obtaining a digest from the candidate at verification time does not establish approval.

```sh
patchproof verify --base main \
  --expected-contract-digest "$APPROVED_CONTRACT_DIGEST" \
  --output .patchproof/proofs/candidate.json \
  --report .patchproof/proofs/candidate.html \
  --summary .patchproof/proofs/candidate.md
```

If the contract changed, verification fails before analyzers or repository commands execute. YAML whitespace and comments do not change the digest. In human mode, the CLI reports analyzer and command progress on stderr and shows findings with remediation on stdout. `--json` keeps the result machine-readable.

## 3. Enforce who signed a proof and what it describes

An internally valid bundle may describe a rejected patch. A cryptographically valid signature may come from a key you have never trusted. Express acceptance requirements explicitly:

```sh
patchproof verify-bundle .patchproof/proofs/candidate.json \
  --trusted-key trusted/ci-public.pem \
  --expected-head "$CANDIDATE_SHA" \
  --expected-base "$BASE_SHA" \
  --expected-contract-digest "$APPROVED_CONTRACT_DIGEST" \
  --require-base-policy \
  --require-verified \
  --json
```

Use full 40- or 64-character commit hashes, not branch names or abbreviated hashes. The expected contract digest is a full SHA-256. These expected values and public keys must come from a trusted source independent of the received bundle.

- `--trusted-key` requires a signature from one of the supplied Ed25519 keys. Repeat it to allow old and new keys during rotation. Public keys are compared by their canonical DER bytes, so PEM line endings do not matter.
- `--require-signature` requires a valid signature but does not establish signer trust on its own.
- `--require-base-policy` rejects working-tree and explicit-file policy seals, and verification checks that a base seal references the bundled base commit. It does not fetch that commit or independently verify its policy blob.
- `--require-verified` rejects internally valid `rejected` and `incomplete` bundles.
- An empty `trustedPublicKeys` array in the API trusts nobody.

All checks must pass for exit `0`. Failure exits `1`. The JSON shape stays `{ valid, errors, signature }`. A proof signed by an unknown key can have `signature: "valid"` and `valid: false`: the signature is authentic to that key, but the key is untrusted. Malformed files also return a machine-readable failure.

## 4. Compare successive candidates

```sh
patchproof compare .patchproof/proofs/before.json .patchproof/proofs/candidate.json \
  --output .patchproof/proofs/comparison.md

patchproof compare .patchproof/proofs/before.json .patchproof/proofs/candidate.json \
  --json --fail-on-regression
```

Comparison validates both bundles, then reports new, absent, persistent, and escalated findings; claim transitions; command transitions; and verdict changes. New warning/blocking findings, increased severity, declining claim support, previously passing commands losing support, and a worse verdict count as regressions.

With `--fail-on-regression`:

| Exit | Meaning |
| ---: | --- |
| 0 | Comparable verification bases and no detected regression |
| 1 | Regression detected, or invalid input/command error |
| 2 | Inconclusive: repository name, base commit, policy digest/source/path, contract digest, or generator version differs |

Without that flag, a valid comparison exits `0` even if it reports regressions. A no-regression result does not mean the candidate is verified: both candidates may still have the same blocking findings.

Findings match by rule ID and fingerprint. Line-sensitive fingerprints can change when code moves. An absent finding is not proof that the underlying bug was fixed. Repository names are labels, not authenticated repository identities; comparison does not check Git ancestry, rerun commands, or establish signer trust. Apply the acceptance checks in step 3 to **both** bundles before using comparison as a CI gate.

## 5. Put actionable evidence into code review

```sh
patchproof report .patchproof/proofs/candidate.json \
  --format markdown --output .patchproof/proofs/review.md
```

Markdown summaries include the exact commits, trust context, command outcomes, claims, findings, and remediation. They omit raw diffs and command logs, limit long finding/claim lists, escape repository-controlled markup and mentions, and flag truncated output and weak policy modes. They can still contain sensitive filenames or descriptions; review before sharing.

The composite Action now writes a Markdown summary into the GitHub job summary even when verification produces a rejected or incomplete verdict. Its `verdict` output remains available for those outcomes. `summary-path` configures the artifact, and an empty value disables it. `expected-contract-digest` passes the approved contract into verification. Verification errors that produce no bundle do not publish an old summary.

Keep artifacts after a failed gate with an explicit workflow step:

```yaml
- name: Retain PatchProof evidence
  if: always()
  uses: actions/upload-artifact@v7
  with:
    name: patchproof-evidence
    path: .patchproof/proofs/
    if-no-files-found: ignore
    retention-days: 7
```

When consuming the enhanced Action, pin a commit containing these changes. The existing `v0.1.0` tag has the older inputs and outputs.

## Programmatic use

```ts
import { readProofBundle, verifyProofBundle, compareProofBundles, renderProofSummary } from "@giancoferrari/patchproof";

const proof = await readProofBundle("candidate.json"); // full published-schema validation
const acceptance = verifyProofBundle(proof, {
  trustedPublicKeys: [trustedPublicKeyPem],
  expectedHead: candidateCommit,
  requireBasePolicy: true,
  requireVerified: true,
});
if (!acceptance.valid) throw new Error(acceptance.errors.join(" "));
const markdown = renderProofSummary(proof);
const comparison = compareProofBundles(previousProof, proof);
```

`verifyProofBundle` accepts `unknown` and returns an invalid result for malformed values. `parseProofBundle` and `readProofBundle` throw descriptive errors for invalid structure. Validation does not coerce fields, inject defaults, or change the signed document. Unknown fields are rejected according to schema `1.0`; arbitrary JSON metadata remains supported. Existing schema-conforming `1.0` bundles continue to work, with additional checks for contradictory command evidence and false base-policy seals.
