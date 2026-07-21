import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerResult,
  PatchProofPolicy,
} from "../types.js";
import { canonicalJson, sha256 } from "../utils/hash.js";
import {
  DEPENDENCY_REVIEW_ANALYZER_ID,
  dependencyReviewAnalyzer,
} from "./dependency-review.js";
import { DIFF_SIZE_ANALYZER_ID, diffSizeAnalyzer } from "./diff-size.js";
import { MISSING_TESTS_ANALYZER_ID, missingTestsAnalyzer } from "./missing-tests.js";
import {
  POLICY_INTEGRITY_ANALYZER_ID,
  policyIntegrityAnalyzer,
} from "./policy-integrity.js";
import { SCOPE_ANALYZER_ID, scopeAnalyzer } from "./scope.js";
import { SECRET_SCAN_ANALYZER_ID, secretScanAnalyzer } from "./secret-scan.js";
import { TEST_INTEGRITY_ANALYZER_ID, testIntegrityAnalyzer } from "./test-integrity.js";

export {
  DEPENDENCY_REVIEW_ANALYZER_ID,
  dependencyReviewAnalyzer,
} from "./dependency-review.js";
export { DIFF_SIZE_ANALYZER_ID, diffSizeAnalyzer } from "./diff-size.js";
export { MISSING_TESTS_ANALYZER_ID, missingTestsAnalyzer } from "./missing-tests.js";
export {
  POLICY_INTEGRITY_ANALYZER_ID,
  policyIntegrityAnalyzer,
} from "./policy-integrity.js";
export { matchesScopePattern, SCOPE_ANALYZER_ID, scopeAnalyzer } from "./scope.js";
export { SECRET_SCAN_ANALYZER_ID, secretScanAnalyzer } from "./secret-scan.js";
export { TEST_INTEGRITY_ANALYZER_ID, testIntegrityAnalyzer } from "./test-integrity.js";
export { isSourceFile, isTestFile, normalizePath, parseUnifiedPatch } from "./utils.js";

export const ANALYZER_REGISTRY: ReadonlyMap<string, Analyzer> = new Map<string, Analyzer>([
  [POLICY_INTEGRITY_ANALYZER_ID, policyIntegrityAnalyzer],
  [TEST_INTEGRITY_ANALYZER_ID, testIntegrityAnalyzer],
  [SECRET_SCAN_ANALYZER_ID, secretScanAnalyzer],
  [SCOPE_ANALYZER_ID, scopeAnalyzer],
  [DEPENDENCY_REVIEW_ANALYZER_ID, dependencyReviewAnalyzer],
  [DIFF_SIZE_ANALYZER_ID, diffSizeAnalyzer],
  [MISSING_TESTS_ANALYZER_ID, missingTestsAnalyzer],
]);

export const DETERMINISTIC_ANALYZERS: readonly Analyzer[] = [...ANALYZER_REGISTRY.values()];

function ruleEnabled(policy: PatchProofPolicy, analyzerId: string): boolean {
  switch (analyzerId) {
    case POLICY_INTEGRITY_ANALYZER_ID:
      return policy.rules.policyIntegrity;
    case TEST_INTEGRITY_ANALYZER_ID:
      return policy.rules.testIntegrity;
    case SECRET_SCAN_ANALYZER_ID:
      return policy.rules.secretScan;
    case SCOPE_ANALYZER_ID:
      return policy.rules.scope;
    case DEPENDENCY_REVIEW_ANALYZER_ID:
      return policy.rules.dependencyReview;
    case DIFF_SIZE_ANALYZER_ID:
      return policy.rules.diffSize;
    case MISSING_TESTS_ANALYZER_ID:
      return true;
    default:
      return false;
  }
}

export function enabledAnalyzers(context: AnalyzerContext): readonly Analyzer[] {
  return DETERMINISTIC_ANALYZERS.filter((analyzer) => ruleEnabled(context.policy, analyzer.id));
}

export function createBuiltinAnalyzers(policy: PatchProofPolicy): Analyzer[] {
  return DETERMINISTIC_ANALYZERS.filter((analyzer) => ruleEnabled(policy, analyzer.id));
}

export async function runAnalyzers(
  analyzers: readonly Analyzer[],
  context: AnalyzerContext,
): Promise<AnalyzerResult> {
  const results = await Promise.all(analyzers.map(async (analyzer) => analyzer.analyze(context)));
  const linkedResults = results.map((result, index) => {
    const findings = result.findings.slice().sort((left, right) => left.id.localeCompare(right.id));
    const findingIds = findings.map((finding) => finding.id);
    return {
      findings,
      evidence: result.evidence.map((record) => ({
        ...record,
        metadata: {
          ...record.metadata,
          analyzerId: analyzers[index]?.id ?? record.metadata["ruleId"],
          findingIds,
          findingsDigest: sha256(canonicalJson(findings)),
        },
      })),
    };
  });
  return {
    evidence: linkedResults.flatMap((result) => result.evidence),
    findings: linkedResults.flatMap((result) => result.findings),
  };
}

export async function runDeterministicAnalyzers(
  context: AnalyzerContext,
  analyzerIds?: readonly string[],
): Promise<AnalyzerResult> {
  const analyzers =
    analyzerIds === undefined
      ? enabledAnalyzers(context)
      : analyzerIds.map((id) => {
          const analyzer = ANALYZER_REGISTRY.get(id);
          if (analyzer === undefined) {
            throw new Error(`Unknown analyzer: ${id}`);
          }
          return analyzer;
        });
  return runAnalyzers(analyzers, context);
}
