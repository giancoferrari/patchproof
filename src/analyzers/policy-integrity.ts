import type { Analyzer, AnalyzerResult, FileChange } from "../types.js";
import {
  changedPaths,
  evidenceStatusForFindings,
  makeEvidence,
  makeFinding,
  normalizePath,
  sortFindings,
  uniqueSortedPaths,
} from "./utils.js";

export const POLICY_INTEGRITY_ANALYZER_ID = "policy-integrity";

const POLICY_PATHS = new Set([
  ".patchproof/policy.yml",
  ".patchproof/policy.yaml",
  ".patchproof/policy.json",
]);

function isPolicyPath(path: string): boolean {
  return POLICY_PATHS.has(normalizePath(path).toLowerCase());
}

function policyPathForChange(file: FileChange): string | null {
  const paths = changedPaths(file);
  return paths.find(isPolicyPath) ?? null;
}

export const policyIntegrityAnalyzer: Analyzer = {
  id: POLICY_INTEGRITY_ANALYZER_ID,
  async analyze(context): Promise<AnalyzerResult> {
    const startedAt = new Date();
    const findings = [];
    const protectedChanges = context.patch.files
      .map((file) => ({ file, policyPath: policyPathForChange(file) }))
      .filter((entry): entry is { file: FileChange; policyPath: string } => entry.policyPath !== null);

    for (const { file, policyPath } of protectedChanges) {
      const currentPath = normalizePath(file.path);
      const basePath = normalizePath(file.previousPath ?? policyPath);
      let changed = file.kind !== "unknown";
      let comparisonFailed = false;

      try {
        const [baseValue, headValue] = await Promise.all([
          context.getFileAtRef(context.patch.baseCommit, basePath),
          context.getFileAtRef(context.patch.headCommit, currentPath),
        ]);
        changed = baseValue !== headValue || basePath !== currentPath;
      } catch {
        comparisonFailed = true;
        changed = true;
      }

      if (!changed) {
        continue;
      }

      findings.push(
        makeFinding({
          ruleId: comparisonFailed
            ? "policy-integrity.comparison-failed"
            : "policy-integrity.modified",
          title: comparisonFailed ? "Policy integrity could not be verified" : "Verification policy changed",
          description: comparisonFailed
            ? `PatchProof could not compare ${policyPath} with the trusted base revision.`
            : `The patch changes ${policyPath}, but verification policy must be loaded from and remain anchored to the trusted base revision.`,
          severity: "blocking",
          relatedFiles: changedPaths(file),
          fingerprintParts: [policyPath, file.kind, basePath, currentPath],
          location: { path: currentPath },
          remediation: comparisonFailed
            ? "Make the base revision available and run verification again."
            : "Move policy changes to a separately reviewed patch, or verify this patch against the unchanged base policy.",
        }),
      );
    }

    sortFindings(findings);
    const relatedFiles = uniqueSortedPaths(protectedChanges.flatMap(({ file }) => changedPaths(file)));
    const status = evidenceStatusForFindings(findings);
    return {
      findings,
      evidence: [
        makeEvidence({
          analyzerId: POLICY_INTEGRITY_ANALYZER_ID,
          patch: context.patch,
          status,
          startedAt,
          summary:
            findings.length === 0
              ? "Verification policy remained anchored to the base revision."
              : `${findings.length} verification policy integrity issue${findings.length === 1 ? "" : "s"} detected.`,
          relatedFiles,
          metadata: {
            protectedPaths: [...POLICY_PATHS].sort(),
            changedProtectedFiles: relatedFiles.length,
          },
        }),
      ],
    };
  },
};
