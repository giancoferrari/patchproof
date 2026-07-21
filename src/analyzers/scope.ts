import { minimatch } from "minimatch";

import type { Analyzer, AnalyzerResult } from "../types.js";
import {
  changedPaths,
  evidenceStatusForFindings,
  makeEvidence,
  makeFinding,
  normalizePath,
  sortFindings,
  uniqueSortedPaths,
} from "./utils.js";

export const SCOPE_ANALYZER_ID = "scope";

function normalizePattern(pattern: string): string {
  return pattern.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function containsGlob(pattern: string): boolean {
  return /[*?{}[\]()!+@]/.test(pattern);
}

export function matchesScopePattern(path: string, rawPattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const pattern = normalizePattern(rawPattern);
  if (pattern.length === 0) {
    return false;
  }
  if (!containsGlob(pattern)) {
    const prefix = pattern.replace(/\/+$/, "");
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  return minimatch(normalizedPath, pattern, {
    dot: true,
    matchBase: false,
    nonegate: true,
    nocomment: true,
  });
}

function matchingPattern(path: string, patterns: readonly string[]): string | null {
  return patterns.find((pattern) => matchesScopePattern(path, pattern)) ?? null;
}

export const scopeAnalyzer: Analyzer = {
  id: SCOPE_ANALYZER_ID,
  async analyze(context): Promise<AnalyzerResult> {
    const startedAt = new Date();
    const findings = [];
    const allChangedPaths = uniqueSortedPaths(context.patch.files.flatMap(changedPaths));
    const allowed = context.policy.scope.allowed.filter((pattern) => pattern.trim().length > 0);
    const denied = context.policy.scope.denied.filter((pattern) => pattern.trim().length > 0);
    const contractOutOfScope = context.contract.outOfScope.filter((pattern) => pattern.trim().length > 0);

    for (const path of allChangedPaths) {
      const deniedBy = matchingPattern(path, denied);
      if (deniedBy !== null) {
        findings.push(
          makeFinding({
            ruleId: "scope.denied",
            title: "Denied path changed",
            description: `${path} is excluded by the policy scope pattern ${JSON.stringify(deniedBy)}.`,
            severity: "blocking",
            relatedFiles: [path],
            fingerprintParts: [path, normalizePattern(deniedBy)],
            location: { path },
            remediation: "Remove this change or update the trusted policy in a separately reviewed patch.",
          }),
        );
      }

      if (allowed.length > 0 && matchingPattern(path, allowed) === null) {
        findings.push(
          makeFinding({
            ruleId: "scope.not-allowed",
            title: "Path is outside the allowed scope",
            description: `${path} does not match any allowed policy scope pattern.`,
            severity: "blocking",
            relatedFiles: [path],
            fingerprintParts: [path, ...allowed.map(normalizePattern).sort()],
            location: { path },
            remediation: "Limit the patch to an allowed path or review a policy expansion separately.",
          }),
        );
      }

      const outOfScopeBy = matchingPattern(path, contractOutOfScope);
      if (outOfScopeBy !== null) {
        findings.push(
          makeFinding({
            ruleId: "scope.contract-out-of-scope",
            title: "Contract-excluded path changed",
            description: `${path} matches the task contract's out-of-scope pattern ${JSON.stringify(outOfScopeBy)}.`,
            severity: "blocking",
            relatedFiles: [path],
            fingerprintParts: [path, normalizePattern(outOfScopeBy)],
            location: { path },
            remediation: "Remove the unrelated change or revise the contract before implementation and review it explicitly.",
          }),
        );
      }
    }

    sortFindings(findings);
    return {
      findings,
      evidence: [
        makeEvidence({
          analyzerId: SCOPE_ANALYZER_ID,
          patch: context.patch,
          status: evidenceStatusForFindings(findings),
          startedAt,
          summary:
            findings.length === 0
              ? `${allChangedPaths.length} changed path${allChangedPaths.length === 1 ? "" : "s"} stayed within policy and contract scope.`
              : `${findings.length} scope violation${findings.length === 1 ? "" : "s"} detected.`,
          relatedFiles: allChangedPaths,
          metadata: {
            changedPaths: allChangedPaths.length,
            allowedPatterns: allowed,
            deniedPatterns: denied,
            contractOutOfScopePatterns: contractOutOfScope,
          },
        }),
      ],
    };
  },
};
