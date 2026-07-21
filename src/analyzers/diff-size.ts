import type { Analyzer, AnalyzerResult } from "../types.js";
import {
  evidenceStatusForFindings,
  makeEvidence,
  makeFinding,
  uniqueSortedPaths,
} from "./utils.js";

export const DIFF_SIZE_ANALYZER_ID = "diff-size";

export const diffSizeAnalyzer: Analyzer = {
  id: DIFF_SIZE_ANALYZER_ID,
  async analyze(context): Promise<AnalyzerResult> {
    const startedAt = new Date();
    const findings = [];
    const relatedFiles = uniqueSortedPaths(context.patch.files.map((file) => file.path));
    const filesChanged = context.patch.stats.filesChanged;
    const changedLines = context.patch.stats.additions + context.patch.stats.deletions;
    const { maxChangedFiles, maxChangedLines } = context.policy.thresholds;

    if (filesChanged > maxChangedFiles) {
      findings.push(
        makeFinding({
          ruleId: "diff-size.files-exceeded",
          title: "Changed-file threshold exceeded",
          description: `The patch changes ${filesChanged} files; policy permits at most ${maxChangedFiles}.`,
          severity: "blocking",
          relatedFiles,
          fingerprintParts: [filesChanged, maxChangedFiles],
          remediation: "Split the work into smaller, independently verifiable patches or review a threshold change separately.",
        }),
      );
    }

    if (changedLines > maxChangedLines) {
      findings.push(
        makeFinding({
          ruleId: "diff-size.lines-exceeded",
          title: "Changed-line threshold exceeded",
          description: `The patch adds or removes ${changedLines} lines; policy permits at most ${maxChangedLines}.`,
          severity: "blocking",
          relatedFiles,
          fingerprintParts: [changedLines, maxChangedLines],
          remediation: "Reduce generated churn or split the work into smaller, independently verifiable patches.",
        }),
      );
    }

    return {
      findings,
      evidence: [
        makeEvidence({
          analyzerId: DIFF_SIZE_ANALYZER_ID,
          patch: context.patch,
          status: evidenceStatusForFindings(findings),
          startedAt,
          summary:
            findings.length === 0
              ? `Patch size is within policy: ${filesChanged} files and ${changedLines} changed lines.`
              : `${findings.length} patch-size threshold${findings.length === 1 ? "" : "s"} exceeded.`,
          relatedFiles,
          metadata: {
            filesChanged,
            maxChangedFiles,
            changedLines,
            maxChangedLines,
            additions: context.patch.stats.additions,
            deletions: context.patch.stats.deletions,
          },
        }),
      ],
    };
  },
};
