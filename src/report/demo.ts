import type {
  Finding,
  PatchContract,
  PatchProofPolicy,
  PatchSnapshot,
  PolicySeal,
  ProofBundle,
} from "../types.js";
import { computePatchStats, parseGitDiff } from "../git/diff.js";
import { canonicalJson, sha256 } from "../utils/hash.js";
import { createProofBundle } from "../proof/bundle.js";
import { evaluateClaims } from "../proof/claims.js";
import { sealEvidence } from "../proof/evidence.js";
import { computeVerdict } from "../proof/verdict.js";

export function createDemoBundle(): ProofBundle {
  const diff = `diff --git a/src/pagination.ts b/src/pagination.ts
index 1f6be01..c94da45 100644
--- a/src/pagination.ts
+++ b/src/pagination.ts
@@ -18,6 +18,10 @@ export function decodeCursor(value: string) {
+  if (value.length === 0) return null;
   return JSON.parse(Buffer.from(value, "base64url").toString());
 }
diff --git a/tests/pagination.test.ts b/tests/pagination.test.ts
index 77a2111..20d0f30 100644
--- a/tests/pagination.test.ts
+++ b/tests/pagination.test.ts
@@ -41,7 +41,7 @@ describe("decodeCursor", () => {
-  it("rejects malformed cursors", () => {
+  it.skip("rejects malformed cursors", () => {
     expect(() => decodeCursor("%%%")) .toThrow();
   });`;
  const patch: PatchSnapshot = {
    repositoryRoot: ".",
    repositoryName: "acme-api",
    branch: "agent/fix-pagination",
    baseRef: "main",
    headRef: "agent/fix-pagination",
    baseCommit: "7df2b0a279cf435e6e9fd3a9f4b3ab4c0f85a132",
    headCommit: "d874cf3f83a0a63d08ef80dc555eb2aa66282f9e",
    diff,
    diffDigest: sha256(diff),
    files: parseGitDiff(diff),
    stats: computePatchStats(parseGitDiff(diff)),
  };
  const policy: PatchProofPolicy = {
    version: 1,
    commands: [
      { id: "tests", run: "npm test", description: "Run the full test suite", timeoutMs: 300_000, required: true },
      { id: "types", run: "npm run typecheck", description: "Check TypeScript", timeoutMs: 180_000, required: true },
    ],
    scope: { allowed: ["src/**", "tests/**"], denied: [".github/workflows/**", ".patchproof/policy.yml"] },
    thresholds: { maxChangedFiles: 20, maxChangedLines: 500, requireTestsForSourceChanges: true },
    rules: {
      policyIntegrity: true,
      testIntegrity: true,
      secretScan: true,
      dependencyReview: true,
      scope: true,
      diffSize: true,
    },
    model: { provider: "none" },
    redactions: ["API_KEY", "TOKEN", "PASSWORD"],
  };
  const contract: PatchContract = {
    version: 1,
    id: "cursor-pagination-fix",
    title: "Harden cursor pagination",
    task: "Reject empty and malformed cursors without changing the public response schema.",
    claims: [
      {
        id: "empty-cursor-safe",
        statement: "Empty cursors no longer crash request handling.",
        severity: "blocking",
        evidence: { commands: ["tests"], paths: ["src/pagination.ts"], requireTestChange: true },
      },
      {
        id: "schema-compatible",
        statement: "The public pagination response schema is unchanged.",
        severity: "blocking",
        evidence: { commands: ["types"], rules: ["scope"] },
      },
      {
        id: "tests-preserved",
        statement: "Existing cursor protections remain enabled.",
        severity: "blocking",
        evidence: { rules: ["test-integrity"] },
      },
    ],
    outOfScope: ["src/auth/**", "src/billing/**"],
  };
  const findings: Finding[] = [
    {
      id: "finding-test-skip-1",
      ruleId: "test-integrity",
      title: "Existing protection was skipped",
      description: "The patch changes an active malformed-cursor test to it.skip, so the passing suite no longer proves the original behavior.",
      severity: "blocking",
      location: { path: "tests/pagination.test.ts", line: 44 },
      relatedFiles: ["tests/pagination.test.ts"],
      fingerprint: sha256("test-integrity:tests/pagination.test.ts:44:it.skip"),
      remediation: "Restore the active test and fix decodeCursor without weakening malformed-input coverage.",
    },
    {
      id: "finding-schema-gap-1",
      ruleId: "contract-coverage",
      title: "Schema compatibility lacks direct evidence",
      description: "Type checking passed, but no response-schema snapshot or contract test was declared for this claim.",
      severity: "warning",
      relatedFiles: ["src/pagination.ts"],
      fingerprint: sha256("contract-coverage:schema-compatible"),
      remediation: "Attach a response contract test or schema-diff command to schema-compatible.",
    },
  ];
  const findingManifest = (items: Finding[]): Record<string, unknown> => ({
    findingIds: items.map((finding) => finding.id).sort(),
    findingsDigest: sha256(
      canonicalJson(items.slice().sort((left, right) => left.id.localeCompare(right.id))),
    ),
  });
  const noFindings = findingManifest([]);
  const testIntegrityFindings = findings.filter(
    (finding) => finding.ruleId === "test-integrity",
  );
  const evidence = sealEvidence([
    {
      id: "evidence-policy-integrity",
      type: "rule",
      producer: "patchproof/analyzer/policy-integrity",
      status: "passed",
      startedAt: "2026-07-21T09:12:02.970Z",
      completedAt: "2026-07-21T09:12:02.980Z",
      durationMs: 10,
      summary: "Verification policy remained anchored to the base revision",
      relatedFiles: [],
      metadata: {
        ruleId: "policy-integrity",
        analyzerId: "policy-integrity",
        ...noFindings,
      },
    },
    {
      id: "evidence-scope",
      type: "rule",
      producer: "patchproof/analyzer/scope",
      status: "passed",
      startedAt: "2026-07-21T09:12:03.000Z",
      completedAt: "2026-07-21T09:12:03.011Z",
      durationMs: 11,
      summary: "Every changed file is within declared scope",
      relatedFiles: patch.files.map((file) => file.path),
      metadata: { ruleId: "scope", analyzerId: "scope", matchedFiles: 2, ...noFindings },
    },
    {
      id: "evidence-secret-scan",
      type: "rule",
      producer: "patchproof/analyzer/secret-scan",
      status: "passed",
      startedAt: "2026-07-21T09:12:03.012Z",
      completedAt: "2026-07-21T09:12:03.024Z",
      durationMs: 12,
      summary: "No high-confidence secret patterns found in added lines",
      relatedFiles: patch.files.map((file) => file.path),
      metadata: { ruleId: "secret-scan", analyzerId: "secret-scan", scannedAddedLines: 2, ...noFindings },
    },
    {
      id: "evidence-test-integrity",
      type: "rule",
      producer: "patchproof/analyzer/test-integrity",
      status: "failed",
      startedAt: "2026-07-21T09:12:03.025Z",
      completedAt: "2026-07-21T09:12:03.032Z",
      durationMs: 7,
      summary: "One existing test was changed to a skipped state",
      details: "tests/pagination.test.ts:44 added it.skip for the malformed-cursor regression test.",
      relatedFiles: ["tests/pagination.test.ts"],
      metadata: {
        ruleId: "test-integrity",
        analyzerId: "test-integrity",
        skippedTestsAdded: 1,
        ...findingManifest(testIntegrityFindings),
      },
    },
    {
      id: "evidence-dependency-review",
      type: "rule",
      producer: "patchproof/analyzer/dependency-review",
      status: "passed",
      startedAt: "2026-07-21T09:12:03.033Z",
      completedAt: "2026-07-21T09:12:03.035Z",
      durationMs: 2,
      summary: "No dependency manifests or lockfiles changed",
      relatedFiles: [],
      metadata: { ruleId: "dependency-review", analyzerId: "dependency-review", ...noFindings },
    },
    {
      id: "evidence-diff-size",
      type: "rule",
      producer: "patchproof/analyzer/diff-size",
      status: "passed",
      startedAt: "2026-07-21T09:12:03.036Z",
      completedAt: "2026-07-21T09:12:03.037Z",
      durationMs: 1,
      summary: "Patch size is within policy",
      relatedFiles: patch.files.map((file) => file.path),
      metadata: { ruleId: "diff-size", analyzerId: "diff-size", ...noFindings },
    },
    {
      id: "evidence-missing-test-changes",
      type: "rule",
      producer: "patchproof/analyzer/missing-test-changes",
      status: "passed",
      startedAt: "2026-07-21T09:12:03.038Z",
      completedAt: "2026-07-21T09:12:03.039Z",
      durationMs: 1,
      summary: "One qualifying test file change found",
      relatedFiles: ["tests/pagination.test.ts"],
      metadata: {
        ruleId: "missing-test-changes",
        analyzerId: "missing-test-changes",
        ...noFindings,
      },
    },
    {
      id: "evidence-tests",
      type: "command",
      producer: "command:tests",
      status: "passed",
      startedAt: "2026-07-21T09:12:03.040Z",
      completedAt: "2026-07-21T09:12:05.382Z",
      durationMs: 2342,
      summary: "Test command exited successfully",
      command: "npm test",
      exitCode: 0,
      stdout: "PASS tests/pagination.test.ts\nTests: 1 skipped, 42 passed, 43 total\nTime: 2.11 s",
      stderr: "",
      relatedFiles: [],
      metadata: { commandId: "tests", required: true },
    },
    {
      id: "evidence-types",
      type: "command",
      producer: "command:types",
      status: "passed",
      startedAt: "2026-07-21T09:12:05.390Z",
      completedAt: "2026-07-21T09:12:06.601Z",
      durationMs: 1211,
      summary: "TypeScript check exited successfully",
      command: "npm run typecheck",
      exitCode: 0,
      stdout: "> acme-api@4.8.0 typecheck\n> tsc --noEmit",
      stderr: "",
      relatedFiles: [],
      metadata: { commandId: "types", required: true },
    },
  ]);
  const claims = evaluateClaims(contract.claims, evidence, findings, patch);
  const verdict = computeVerdict(policy, claims, evidence, findings);
  const policySeal: PolicySeal = {
    source: "base-commit",
    sourceRef: patch.baseCommit,
    path: ".patchproof/policy.yml",
    digest: sha256(canonicalJson(policy)),
  };

  return createProofBundle({
    packageVersion: "0.1.0",
    patch,
    policy,
    policySeal,
    contract,
    evidence,
    findings,
    claims,
    verdict,
    createdAt: "2026-07-21T09:12:06.615Z",
  });
}
