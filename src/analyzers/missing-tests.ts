import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerResult,
  FileChange,
  Severity,
} from "../types.js";
import {
  changedLinesForFile,
  evidenceStatusForFindings,
  isSourceFile,
  isTestFile,
  makeEvidence,
  makeFinding,
  uniqueSortedPaths,
} from "./utils.js";

export const MISSING_TESTS_ANALYZER_ID = "missing-test-changes";

async function isQualifyingTestChange(
  context: AnalyzerContext,
  file: FileChange,
): Promise<boolean> {
  if (file.kind === "deleted" || file.additions <= 0) {
    return false;
  }
  if (isTestFile(file.path)) {
    return true;
  }
  if (!file.path.toLowerCase().endsWith(".rs")) {
    return false;
  }

  const lines = await changedLinesForFile(context, file);
  const addedLines = lines.filter((line) => line.kind === "added").map((line) => line.content);
  if (addedLines.some((line) => /^\s*#\s*\[test\]\s*$/.test(line))) {
    return true;
  }
  const hunkShowsTestModule = lines.some((line) =>
    /^\s*(?:#\s*\[cfg\s*\(\s*test\s*\)\]|mod\s+tests\b)/.test(line.content),
  );
  return (
    hunkShowsTestModule &&
    addedLines.some((line) => /\b(?:assert|assert_eq|assert_ne|matches)!\s*\(/.test(line))
  );
}

function strongestSeverity(severities: readonly Severity[]): Severity {
  if (severities.includes("blocking")) {
    return "blocking";
  }
  return "warning";
}

export const missingTestsAnalyzer: Analyzer = {
  id: MISSING_TESTS_ANALYZER_ID,
  async analyze(context): Promise<AnalyzerResult> {
    const startedAt = new Date();
    const sourceFiles = uniqueSortedPaths(
      context.patch.files
        .filter(
          (file) =>
            isSourceFile(file.path) ||
            (file.previousPath !== undefined && isSourceFile(file.previousPath)),
        )
        .map((file) => file.previousPath ?? file.path),
    );
    const testQualification = await Promise.all(
      context.patch.files.map(async (file) => ({
        path: file.path,
        qualifies: await isQualifyingTestChange(context, file),
      })),
    );
    const testFiles = uniqueSortedPaths(
      testQualification.filter((entry) => entry.qualifies).map((entry) => entry.path),
    );
    const claimsRequiringTests = context.contract.claims.filter(
      (claim) => claim.evidence.requireTestChange === true,
    );
    const requiredByPolicy =
      context.policy.thresholds.requireTestsForSourceChanges && sourceFiles.length > 0;
    const requiredByContract = claimsRequiringTests.length > 0;
    const hasTestChange = testFiles.length > 0;
    const findings = [];

    if ((requiredByPolicy || requiredByContract) && !hasTestChange) {
      const claimIds = claimsRequiringTests.map((claim) => claim.id).sort();
      const severity = requiredByPolicy
        ? "blocking"
        : strongestSeverity(claimsRequiringTests.map((claim) => claim.severity));
      const reasons = [
        ...(requiredByPolicy ? ["policy requires tests for source changes"] : []),
        ...(requiredByContract
          ? [`${claimsRequiringTests.length} contract claim${claimsRequiringTests.length === 1 ? "" : "s"} require a test change`]
          : []),
      ];
      findings.push(
        makeFinding({
          ruleId: "missing-test-changes.required",
          title: "Required test change is missing",
          description: `No added or updated test file was found, but ${reasons.join(" and ")}.`,
          severity,
          relatedFiles: sourceFiles,
          fingerprintParts: [requiredByPolicy, ...claimIds, ...sourceFiles],
          remediation: "Add a regression test that fails before the patch and passes with the intended behavior.",
        }),
      );
    }

    const required = requiredByPolicy || requiredByContract;
    const relatedFiles = uniqueSortedPaths([...sourceFiles, ...testFiles]);
    return {
      findings,
      evidence: [
        makeEvidence({
          analyzerId: MISSING_TESTS_ANALYZER_ID,
          patch: context.patch,
          status: evidenceStatusForFindings(findings),
          startedAt,
          summary: !required
            ? "No policy or contract requirement demanded a test change."
            : hasTestChange
              ? `${testFiles.length} qualifying test file change${testFiles.length === 1 ? "" : "s"} found.`
              : "A required test change was not found.",
          relatedFiles,
          metadata: {
            sourceFiles,
            qualifyingTestFiles: testFiles,
            requiredByPolicy,
            requiredByClaims: claimsRequiringTests.map((claim) => claim.id).sort(),
          },
        }),
      ],
    };
  },
};
