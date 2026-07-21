import { describe, expect, it } from "vitest";

import {
  ANALYZER_REGISTRY,
  createBuiltinAnalyzers,
  dependencyReviewAnalyzer,
  diffSizeAnalyzer,
  enabledAnalyzers,
  isSourceFile,
  isTestFile,
  matchesScopePattern,
  missingTestsAnalyzer,
  parseUnifiedPatch,
  policyIntegrityAnalyzer,
  runAnalyzers,
  runDeterministicAnalyzers,
  scopeAnalyzer,
  secretScanAnalyzer,
  testIntegrityAnalyzer,
} from "../src/analyzers/index.js";
import type {
  AnalyzerContext,
  ClaimDefinition,
  FileChange,
  PatchContract,
  PatchProofPolicy,
  PatchSnapshot,
} from "../src/types.js";

interface ContextOptions {
  files?: FileChange[];
  policy?: PatchProofPolicy;
  contract?: PatchContract;
  filesAtRef?: Readonly<Record<string, string | null>>;
  stats?: Partial<PatchSnapshot["stats"]>;
}

function unifiedPatch(removed: readonly string[], added: readonly string[]): string {
  const oldCount = removed.length;
  const newCount = added.length;
  return [
    `@@ -1,${oldCount} +1,${newCount} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].join("\n");
}

function change(
  path: string,
  options: {
    kind?: FileChange["kind"];
    additions?: number;
    deletions?: number;
    patch?: string;
    previousPath?: string;
    binary?: boolean;
  } = {},
): FileChange {
  const value: FileChange = {
    path,
    kind: options.kind ?? "modified",
    additions: options.additions ?? 1,
    deletions: options.deletions ?? 0,
    binary: options.binary ?? false,
  };
  if (options.patch !== undefined) {
    value.patch = options.patch;
  }
  if (options.previousPath !== undefined) {
    value.previousPath = options.previousPath;
  }
  return value;
}

function defaultPolicy(): PatchProofPolicy {
  return {
    version: 1,
    commands: [],
    scope: { allowed: [], denied: [] },
    thresholds: {
      maxChangedFiles: 25,
      maxChangedLines: 500,
      requireTestsForSourceChanges: true,
    },
    rules: {
      policyIntegrity: true,
      testIntegrity: true,
      secretScan: true,
      dependencyReview: true,
      scope: true,
      diffSize: true,
    },
    model: { provider: "none" },
    redactions: [],
  };
}

function defaultContract(claims: ClaimDefinition[] = []): PatchContract {
  return {
    version: 1,
    id: "contract-1",
    title: "Synthetic analyzer contract",
    claims,
    outOfScope: [],
  };
}

function makeContext(options: ContextOptions = {}): AnalyzerContext {
  const files = options.files ?? [];
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const patch: PatchSnapshot = {
    repositoryRoot: "/repo",
    repositoryName: "synthetic",
    branch: "feature/proof",
    baseRef: "base",
    headRef: "head",
    baseCommit: "a".repeat(40),
    headCommit: "b".repeat(40),
    diff: files.map((file) => file.patch ?? "").join("\n"),
    diffDigest: `digest-${files.map((file) => `${file.path}:${file.additions}:${file.deletions}`).join("|")}`,
    files,
    stats: {
      filesChanged: options.stats?.filesChanged ?? files.length,
      additions: options.stats?.additions ?? additions,
      deletions: options.stats?.deletions ?? deletions,
      testFilesChanged:
        options.stats?.testFilesChanged ?? files.filter((file) => isTestFile(file.path)).length,
    },
  };
  const filesAtRef = options.filesAtRef ?? {};
  return {
    patch,
    policy: options.policy ?? defaultPolicy(),
    contract: options.contract ?? defaultContract(),
    async getFileAtRef(ref, path): Promise<string | null> {
      const alias =
        ref === patch.baseCommit ? patch.baseRef : ref === patch.headCommit ? patch.headRef : ref;
      return filesAtRef[`${ref}:${path}`] ?? filesAtRef[`${alias}:${path}`] ?? null;
    },
  };
}

describe("analyzer path classification", () => {
  it("recognizes JavaScript, TypeScript, Python, Go, and Rust test conventions", () => {
    expect(isTestFile("src/widget.test.ts")).toBe(true);
    expect(isTestFile("src/widget.spec.tsx")).toBe(true);
    expect(isTestFile("tests/test_widget.py")).toBe(true);
    expect(isTestFile("pkg/widget_test.go")).toBe(true);
    expect(isTestFile("tests/widget.rs")).toBe(true);
    expect(isTestFile("src/widget.ts")).toBe(false);
  });

  it("separates production sources from tests, declarations, docs, and generated output", () => {
    expect(isSourceFile("src/widget.ts")).toBe(true);
    expect(isSourceFile("lib/engine.rs")).toBe(true);
    expect(isSourceFile("src/widget.test.ts")).toBe(false);
    expect(isSourceFile("src/public.d.ts")).toBe(false);
    expect(isSourceFile("docs/example.py")).toBe(false);
    expect(isSourceFile("generated/client.go")).toBe(false);
  });

  it("parses hunk content whose diff lines begin with +++ or ---", () => {
    expect(parseUnifiedPatch(unifiedPatch(["--removed"], ["++added"]))).toEqual([
      { kind: "removed", content: "--removed", oldLine: 1, newLine: null },
      { kind: "added", content: "++added", oldLine: null, newLine: 1 },
    ]);
  });
});

describe("policy integrity analyzer", () => {
  it("blocks modifications to policy anchored at the base revision", async () => {
    const context = makeContext({
      files: [
        change(".patchproof/policy.yml", {
          patch: unifiedPatch(["maxChangedFiles: 10"], ["maxChangedFiles: 500"]),
        }),
      ],
      filesAtRef: {
        "base:.patchproof/policy.yml": "maxChangedFiles: 10",
        "head:.patchproof/policy.yml": "maxChangedFiles: 500",
      },
    });

    const result = await policyIntegrityAnalyzer.analyze(context);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      ruleId: "policy-integrity.modified",
      severity: "blocking",
    });
    expect(result.evidence[0]?.status).toBe("failed");
  });

  it("passes when a syntactically listed change resolves to identical policy content", async () => {
    const context = makeContext({
      files: [change(".patchproof/policy.yml")],
      filesAtRef: {
        "base:.patchproof/policy.yml": "version: 1",
        "head:.patchproof/policy.yml": "version: 1",
      },
    });

    const result = await policyIntegrityAnalyzer.analyze(context);

    expect(result.findings).toEqual([]);
    expect(result.evidence[0]?.status).toBe("passed");
  });
});

describe("test integrity analyzer", () => {
  it("detects deleted tests and net reductions in cases and assertions", async () => {
    const context = makeContext({
      files: [
        change("tests/obsolete.test.ts", {
          kind: "deleted",
          additions: 0,
          deletions: 12,
          patch: unifiedPatch(["test('old', () => expect(run()).toBe(true));"], []),
        }),
        change("tests/feature.test.ts", {
          additions: 1,
          deletions: 2,
          patch: unifiedPatch(
            ["test('one', () => expect(one()).toBe(1));", "test('two', () => expect(two()).toBe(2));"],
            ["test('one', () => one());"],
          ),
        }),
      ],
    });

    const result = await testIntegrityAnalyzer.analyze(context);
    const rules = result.findings.map((finding) => finding.ruleId);

    expect(rules).toContain("test-integrity.test-file-deleted");
    expect(rules).toContain("test-integrity.assertions-reduced");
    expect(rules).toContain("test-integrity.test-cases-reduced");
  });

  it("detects newly skipped tests across JavaScript, Python, Go, and Rust", async () => {
    const context = makeContext({
      files: [
        change("web/widget.test.ts", {
          patch: unifiedPatch([], ["test.skip('later', () => expect(true).toBe(true));"]),
        }),
        change("tests/test_worker.py", {
          patch: unifiedPatch([], ["@pytest.mark.xfail", "def test_worker(): assert worker()"]),
          additions: 2,
        }),
        change("worker/worker_test.go", {
          patch: unifiedPatch([], ["func TestWorker(t *testing.T) { t.Skip(\"later\") }"]),
        }),
        change("tests/worker.rs", {
          patch: unifiedPatch([], ["#[ignore]", "#[test]", "fn worker() {}"]),
          additions: 3,
        }),
      ],
    });

    const result = await testIntegrityAnalyzer.analyze(context);

    expect(result.findings.filter((finding) => finding.ruleId === "test-integrity.skip-added")).toHaveLength(4);
    expect(result.evidence[0]?.status).toBe("failed");
  });

  it("does not treat comments or assertion-preserving rewrites as weakening", async () => {
    const context = makeContext({
      files: [
        change("tests/math.test.ts", {
          patch: unifiedPatch(
            ["expect(sum()).toEqual(2);"],
            ["// test.skip is documented here", "expect(sum()).toStrictEqual(2);"],
          ),
          additions: 2,
          deletions: 1,
        }),
      ],
    });

    const result = await testIntegrityAnalyzer.analyze(context);

    expect(result.findings).toEqual([]);
  });

  it("flags focused tests and exact assertions replaced with truthiness", async () => {
    const context = makeContext({
      files: [
        change("tests/result.test.ts", {
          additions: 2,
          deletions: 1,
          patch: unifiedPatch(
            ["expect(result()).toStrictEqual({ ok: true });"],
            ["test.only('focused', () => run());", "expect(result()).toBeTruthy();"],
          ),
        }),
      ],
    });

    const result = await testIntegrityAnalyzer.analyze(context);
    const rules = result.findings.map((finding) => finding.ruleId);

    expect(rules).toContain("test-integrity.skip-added");
    expect(rules).toContain("test-integrity.assertion-weakened");
  });
});

describe("secret scan analyzer", () => {
  it("finds likely secrets while redacting every matched value from the result", async () => {
    const githubToken = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const password = "Tr0ub4dor-Correct-2026";
    const context = makeContext({
      files: [
        change("src/config.ts", {
          additions: 2,
          patch: unifiedPatch([], [`const token = '${githubToken}';`, `const password = '${password}';`]),
        }),
      ],
    });

    const first = await secretScanAnalyzer.analyze(context);
    const second = await secretScanAnalyzer.analyze(context);
    const serialized = JSON.stringify(first);

    expect(first.findings).toHaveLength(2);
    expect(serialized).not.toContain(githubToken);
    expect(serialized).not.toContain(password);
    expect(serialized).toContain("[REDACTED]");
    expect(first.findings.map((finding) => finding.fingerprint)).toEqual(
      second.findings.map((finding) => finding.fingerprint),
    );
  });

  it("ignores removed values, binary files, environment lookups, and obvious placeholders", async () => {
    const context = makeContext({
      files: [
        change("src/config.ts", {
          additions: 2,
          deletions: 1,
          patch: unifiedPatch(
            ["const token = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';"],
            ["const token = process.env.API_TOKEN;", "const password = 'changeme';"],
          ),
        }),
        change("fixtures/archive.bin", {
          binary: true,
          patch: unifiedPatch([], ["ghp_abcdefghijklmnopqrstuvwxyz1234567890"]),
        }),
      ],
    });

    const result = await secretScanAnalyzer.analyze(context);

    expect(result.findings).toEqual([]);
    expect(result.evidence[0]?.status).toBe("passed");
  });

  it("scans a newly added file even when no unified patch body is available", async () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const context = makeContext({
      files: [change(".env", { kind: "added" })],
      filesAtRef: { "head:.env": `AWS_ACCESS_KEY_ID=${secret}` },
    });

    const result = await secretScanAnalyzer.analyze(context);

    expect(result.findings).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe("scope analyzer", () => {
  it("supports exact directories and glob patterns", () => {
    expect(matchesScopePattern("src/core/index.ts", "src")).toBe(true);
    expect(matchesScopePattern("src/core/index.ts", "src/**/*.ts")).toBe(true);
    expect(matchesScopePattern("docs/index.md", "src/**/*.ts")).toBe(false);
  });

  it("enforces allowed, denied, and contract out-of-scope paths", async () => {
    const policy = defaultPolicy();
    policy.scope = { allowed: ["src/**", "tests/**"], denied: ["src/generated/**"] };
    const contract = defaultContract();
    contract.outOfScope = ["src/billing/**"];
    const context = makeContext({
      policy,
      contract,
      files: [
        change("src/generated/client.ts"),
        change("src/billing/charge.ts"),
        change("docs/architecture.md"),
      ],
    });

    const result = await scopeAnalyzer.analyze(context);
    const rules = result.findings.map((finding) => finding.ruleId);

    expect(rules).toContain("scope.denied");
    expect(rules).toContain("scope.contract-out-of-scope");
    expect(rules).toContain("scope.not-allowed");
    expect(result.findings.every((finding) => finding.severity === "blocking")).toBe(true);
  });
});

describe("dependency review analyzer", () => {
  it("reports package changes and executable install hooks without leaking dependency locators", async () => {
    const before = JSON.stringify({ dependencies: { zod: "^3.0.0" }, scripts: {} });
    const after = JSON.stringify({
      dependencies: { zod: "^4.0.0", toolkit: "https://user:password@example.test/toolkit.tgz" },
      scripts: { postinstall: "node scripts/setup.js" },
    });
    const context = makeContext({
      files: [change("package.json"), change("package-lock.json")],
      filesAtRef: {
        "base:package.json": before,
        "head:package.json": after,
        "base:package-lock.json": "{}",
        "head:package-lock.json": "{}",
      },
    });

    const result = await dependencyReviewAnalyzer.analyze(context);
    const rules = result.findings.map((finding) => finding.ruleId);

    expect(rules).toContain("dependency-review.packages-added-or-updated");
    expect(rules).toContain("dependency-review.non-registry-source");
    expect(rules).toContain("dependency-review.install-hook");
    expect(rules).not.toContain("dependency-review.lockfile-not-updated");
    expect(JSON.stringify(result)).not.toContain("user:password");
  });

  it("warns when an existing lockfile is omitted and when a lockfile changes alone", async () => {
    const manifestOnly = makeContext({
      files: [change("Cargo.toml")],
      filesAtRef: {
        "base:Cargo.lock": "version = 4",
        "head:Cargo.lock": "version = 4",
      },
    });
    const lockOnly = makeContext({ files: [change("go.sum")] });

    const manifestResult = await dependencyReviewAnalyzer.analyze(manifestOnly);
    const lockResult = await dependencyReviewAnalyzer.analyze(lockOnly);

    expect(manifestResult.findings.map((finding) => finding.ruleId)).toContain(
      "dependency-review.lockfile-not-updated",
    );
    expect(lockResult.findings.map((finding) => finding.ruleId)).toContain(
      "dependency-review.lockfile-only",
    );
  });
});

describe("diff size and missing-test analyzers", () => {
  it("blocks both changed-file and changed-line threshold violations with stable fingerprints", async () => {
    const policy = defaultPolicy();
    policy.thresholds.maxChangedFiles = 1;
    policy.thresholds.maxChangedLines = 3;
    const context = makeContext({
      policy,
      files: [change("src/a.ts"), change("src/b.ts")],
      stats: { filesChanged: 2, additions: 3, deletions: 2 },
    });

    const first = await diffSizeAnalyzer.analyze(context);
    const second = await diffSizeAnalyzer.analyze(context);

    expect(first.findings.map((finding) => finding.ruleId)).toEqual([
      "diff-size.files-exceeded",
      "diff-size.lines-exceeded",
    ]);
    expect(first.findings.map((finding) => finding.fingerprint)).toEqual(
      second.findings.map((finding) => finding.fingerprint),
    );
  });

  it("requires a positive test change for production source changes", async () => {
    const missing = makeContext({ files: [change("src/service.ts")] });
    const covered = makeContext({
      files: [change("src/service.ts"), change("tests/service.spec.ts", { additions: 3 })],
    });

    const missingResult = await missingTestsAnalyzer.analyze(missing);
    const coveredResult = await missingTestsAnalyzer.analyze(covered);

    expect(missingResult.findings[0]?.ruleId).toBe("missing-test-changes.required");
    expect(missingResult.findings[0]?.severity).toBe("blocking");
    expect(coveredResult.findings).toEqual([]);
  });

  it("honors a contract test requirement even when the policy threshold is disabled", async () => {
    const policy = defaultPolicy();
    policy.thresholds.requireTestsForSourceChanges = false;
    const contract = defaultContract([
      {
        id: "claim-regression",
        statement: "The regression remains fixed",
        severity: "warning",
        evidence: { requireTestChange: true },
      },
    ]);
    const result = await missingTestsAnalyzer.analyze(makeContext({ policy, contract }));

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
  });

  it("recognizes Rust tests declared inline with a test attribute", async () => {
    const context = makeContext({
      files: [
        change("src/lib.rs", {
          additions: 3,
          patch: unifiedPatch([], ["#[test]", "fn verifies_result() {", "    assert_eq!(result(), 42);"]),
        }),
      ],
    });

    const result = await missingTestsAnalyzer.analyze(context);

    expect(result.findings).toEqual([]);
    expect(result.evidence[0]?.metadata.qualifyingTestFiles).toEqual(["src/lib.rs"]);
  });
});

describe("analyzer registry", () => {
  it("selects policy-enabled analyzers and preserves one evidence record per analyzer", async () => {
    const policy = defaultPolicy();
    policy.rules.secretScan = false;
    policy.rules.dependencyReview = false;
    const context = makeContext({ policy });
    const builtins = createBuiltinAnalyzers(policy);
    const selected = enabledAnalyzers(context);
    const result = await runAnalyzers(builtins, context);

    expect(builtins.map((analyzer) => analyzer.id)).not.toContain("secret-scan");
    expect(builtins.map((analyzer) => analyzer.id)).not.toContain("dependency-review");
    expect(selected.map((analyzer) => analyzer.id)).toEqual(builtins.map((analyzer) => analyzer.id));
    expect(result.evidence).toHaveLength(builtins.length);
    expect(result.evidence.every((record) => record.type === "rule" && record.id.length > 0)).toBe(true);
  });

  it("runs explicitly requested registry analyzers and rejects unknown IDs", async () => {
    const context = makeContext();
    const result = await runDeterministicAnalyzers(context, ["scope", "diff-size"]);

    expect(ANALYZER_REGISTRY.size).toBe(7);
    expect(result.evidence.map((record) => record.producer)).toEqual([
      "patchproof/analyzer/scope",
      "patchproof/analyzer/diff-size",
    ]);
    await expect(runDeterministicAnalyzers(context, ["not-real"])).rejects.toThrow(
      "Unknown analyzer: not-real",
    );
  });
});
