import { describe, expect, it } from "vitest";
import { createDemoBundle } from "../src/report/demo.js";
import { compareProofBundles, renderProofComparison, renderProofSummary, verifyProofBundle } from "../src/proof/index.js";
import { rebuildProof, passingProof } from "./helpers/proof.js";

describe("proof comparison", () => {
  it("identifies restored protections and resolved findings", () => {
    const before = createDemoBundle();
    const after = passingProof();
    expect(verifyProofBundle(after).valid).toBe(true);
    const comparison = compareProofBundles(before, after);
    expect(comparison.comparable).toBe(true);
    expect(comparison.findings.resolved).toHaveLength(2);
    expect(comparison.findings.added).toHaveLength(0);
    expect(comparison.regressions).toEqual([]);
    expect(comparison.claims).toContainEqual({ id: "tests-preserved", before: "disproven", after: "proven" });
    expect(renderProofComparison(comparison)).toContain("no regressions detected");
  });

  it("detects new blocking findings and claim/verdict regressions", () => {
    const comparison = compareProofBundles(passingProof(), createDemoBundle());
    expect(comparison.findings.added).toHaveLength(2);
    expect(comparison.regressions.join(" ")).toMatch(/blocking finding.*tests-preserved.*Verdict/su);
    const markdown = renderProofComparison(comparison);
    expect(markdown).toContain("### Regressions");
    expect(markdown).toContain("Restore the active test");
  });

  it("detects severity escalation even if the fingerprint is unchanged", () => {
    const before = createDemoBundle();
    const after = createDemoBundle();
    after.findings[1]!.severity = "blocking";
    const comparison = compareProofBundles(before, rebuildProof(after));
    expect(comparison.findings.escalated).toHaveLength(1);
    expect(comparison.findings.persistent).toHaveLength(2);
    expect(comparison.findings.added).toHaveLength(0);
    expect(comparison.regressions).toHaveLength(1);
  });

  it("detects missing and skipped commands instead of interpreting them as passing", () => {
    const before = passingProof();
    const after = passingProof();
    after.evidence = after.evidence.filter((record) => record.metadata["commandId"] !== "types");
    const testCommand = after.evidence.find((record) => record.metadata["commandId"] === "tests")!;
    testCommand.status = "skipped";
    testCommand.exitCode = null;
    const comparison = compareProofBundles(before, rebuildProof(after));
    expect(comparison.commands).toEqual([
      { id: "tests", before: "passed", after: "skipped" },
      { id: "types", before: "passed", after: "missing" },
    ]);
    expect(comparison.regressions).toContain("Command types: passed -> missing");
  });

  it.each(["policy", "contract", "base", "source", "version", "repository"])("marks a changed %s basis as inconclusive", (field) => {
    const after = passingProof();
    if (field === "policy") after.policy.value.thresholds.maxChangedFiles += 1;
    if (field === "contract") after.contract.value.claims[0]!.statement = "A different requirement";
    if (field === "base") {
      after.patch.baseCommit = "a".repeat(40);
      after.policy.seal.sourceRef = after.patch.baseCommit;
    }
    if (field === "source") after.policy.seal.source = "explicit-file";
    if (field === "version") after.generator.version = "99.0.0";
    if (field === "repository") after.patch.repositoryName = "different";
    const comparison = compareProofBundles(createDemoBundle(), rebuildProof(after));
    expect(comparison.comparable).toBe(false);
    expect(renderProofComparison(comparison)).toContain("inconclusive");
  });

  it("rejects tampered inputs and shows no differences for identical bundles", () => {
    const before = createDemoBundle();
    const after = createDemoBundle();
    expect(compareProofBundles(before, after).claims).toEqual([]);
    after.contentDigest = "0".repeat(64);
    expect(() => compareProofBundles(before, after)).toThrow(/Invalid candidate/u);
    expect(() => compareProofBundles(after, before)).toThrow(/Invalid baseline/u);
  });
});

describe("Markdown review summaries", () => {
  it("shows actionable evidence, trust context, and the exact candidate", () => {
    const bundle = createDemoBundle();
    const markdown = renderProofSummary(bundle);
    expect(markdown).toContain("## PatchProof: rejected");
    expect(markdown).toContain("tests/pagination.test.ts:44");
    expect(markdown).toContain("Fix: Restore the active test");
    expect(markdown).toContain(bundle.patch.headCommit);
    expect(markdown).toContain("**Signature:** unsigned");
    expect(markdown).toContain("| tests | yes | passed |");
    expect(markdown).not.toContain("PASS tests/pagination.test.ts");
  });

  it("escapes repository-controlled markup, mentions, tables, and control characters", () => {
    const bundle = createDemoBundle();
    bundle.patch.repositoryName = "<script>alert(1)</script>\n| fake | @team \u001b[31m";
    const markdown = renderProofSummary(rebuildProof(bundle));
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("@team");
    expect(markdown).not.toContain("| fake |");
    expect(markdown).not.toContain("\u001b");
    expect(markdown).toContain("&#60;script&#62;");
  });

  it("flags weaker policies and truncated output without exposing command logs", () => {
    const bundle = passingProof();
    bundle.policy.seal.source = "explicit-file";
    bundle.evidence.at(-1)!.metadata["stdoutTruncated"] = true;
    bundle.evidence.at(-1)!.stdout = "private log contents";
    const markdown = renderProofSummary(rebuildProof(bundle));
    expect(markdown).toContain("candidate checkout supplied the policy");
    expect(markdown).toContain("output was truncated");
    expect(markdown).not.toContain("private log contents");
  });

  it("refuses to summarize a modified verdict", () => {
    const bundle = createDemoBundle();
    bundle.verdict.status = "verified";
    expect(() => renderProofSummary(bundle)).toThrow(/invalid proof/u);
  });
});
