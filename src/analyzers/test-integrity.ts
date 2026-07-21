import type { Analyzer, AnalyzerResult } from "../types.js";
import {
  changedLinesForFile,
  changedPaths,
  evidenceStatusForFindings,
  isCommentOnly,
  isTestFile,
  makeEvidence,
  makeFinding,
  normalizePath,
  sortFindings,
  uniqueSortedPaths,
} from "./utils.js";

export const TEST_INTEGRITY_ANALYZER_ID = "test-integrity";

const ASSERTION_PATTERNS: readonly RegExp[] = [
  /\bexpect\s*\(/,
  /\bassert\s*\(/,
  /\bassert\.[A-Za-z_]\w*\s*\(/,
  /^\s*assert\s+(?!from\b|import\b)\S/,
  /\bself\.assert[A-Z]\w*\s*\(/,
  /\b(?:require|assert)\.[A-Z]\w*\s*\(\s*t\b/,
  /\bt\.(?:Error|Errorf|Fatal|Fatalf)\s*\(/,
  /\bassert(?:_eq|_ne|_matches)?!\s*\(/,
  /\bmatches!\s*\(/,
  /\.(?:toBe|toEqual|toStrictEqual|toMatch|toContain|toThrow|should|must)\b/,
];

const STRONG_ASSERTION_PATTERNS: readonly RegExp[] = [
  /\.(?:toBe|toEqual|toStrictEqual|toMatchObject|toThrow|toContain)\s*\(/,
  /\b(?:assertEqual|assertIs|assertIsNone|assertIn|assertRaises)\s*\(/,
  /\bassert_(?:eq|ne|matches)!\s*\(/,
  /\b(?:require|assert)\.(?:Equal|Exactly|Error|NoError)\s*\(/,
];

const WEAK_ASSERTION_PATTERNS: readonly RegExp[] = [
  /\.(?:toBeTruthy|toBeDefined|toBeFalsy)\s*\(/,
  /\.not\.toBeNull\s*\(/,
  /\bassert\.ok\s*\(/,
  /^\s*assert\s+[A-Za-z_][A-Za-z0-9_.]*\s*$/,
];

const TEST_DECLARATION_PATTERNS: readonly RegExp[] = [
  /\b(?:it|test)\s*\(/,
  /\b(?:it|test)\.(?:each|concurrent)\s*\(/,
  /^\s*(?:async\s+)?def\s+test_[A-Za-z0-9_]*\s*\(/,
  /^\s*func\s+Test[A-Za-z0-9_]*\s*\(/,
  /^\s*#\s*\[test\]\s*$/,
];

const SKIP_PATTERNS: readonly RegExp[] = [
  /\b(?:describe|it|test)\.(?:skip|todo|only|failing|fails)\b/,
  /\b(?:describe|it|test)\.(?:concurrent\.)?skip\b/,
  /\b(?:fdescribe|fit|xdescribe|xit|xtest)\s*\(/,
  /@(?:unittest\.)?(?:skip(?:If|Unless)?|expectedFailure)\b/,
  /@pytest\.mark\.(?:skip|skipif|xfail)\b/,
  /\bpytest\.(?:skip|xfail)\s*\(/,
  /\bt\.Skip(?:f|Now)?\s*\(/,
  /^\s*#\s*\[ignore(?:\s*=|\s*\])?/,
];

function matchesAny(line: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(line));
}

function maskStringLiterals(line: string): string {
  let quote: "\"" | "'" | "`" | null = null;
  let escaped = false;
  let masked = "";

  for (const character of line) {
    if (quote !== null) {
      masked += " ";
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      masked += " ";
    } else {
      masked += character;
    }
  }
  return masked;
}

function skipMatch(line: string): { column: number } | null {
  for (const pattern of SKIP_PATTERNS) {
    const match = pattern.exec(line);
    if (match !== null) {
      return { column: match.index + 1 };
    }
  }
  return null;
}

export const testIntegrityAnalyzer: Analyzer = {
  id: TEST_INTEGRITY_ANALYZER_ID,
  async analyze(context): Promise<AnalyzerResult> {
    const startedAt = new Date();
    const findings = [];
    const inspectedFiles: string[] = [];

    for (const file of context.patch.files) {
      const path = normalizePath(file.path);
      const previousPath = normalizePath(file.previousPath ?? file.path);
      const namedTestFile = isTestFile(path) || isTestFile(previousPath);
      if (!namedTestFile) {
        continue;
      }
      const lines = await changedLinesForFile(context, file);
      inspectedFiles.push(path);

      if (file.kind === "deleted" && namedTestFile) {
        findings.push(
          makeFinding({
            ruleId: "test-integrity.test-file-deleted",
            title: "Test file deleted",
            description: `The patch deletes ${previousPath}, removing an entire test surface.`,
            severity: "blocking",
            relatedFiles: changedPaths(file),
            fingerprintParts: [previousPath],
            location: { path: previousPath },
            remediation: "Restore the test file or provide an explicitly reviewed replacement with equivalent coverage.",
          }),
        );
        continue;
      }

      const added = lines.filter((line) => line.kind === "added" && !isCommentOnly(line.content));
      const removed = lines.filter((line) => line.kind === "removed" && !isCommentOnly(line.content));

      for (const line of added) {
        const skipped = skipMatch(maskStringLiterals(line.content));
        if (skipped === null) {
          continue;
        }
        const lineNumber = line.newLine ?? 1;
        findings.push(
          makeFinding({
            ruleId: "test-integrity.skip-added",
            title: "Skipped or expected-failing test added",
            description: `The patch disables a test outcome in ${path} instead of proving the behavior.`,
            severity: "blocking",
            relatedFiles: [path],
            fingerprintParts: [path, lineNumber, line.content.trim()],
            location: { path, line: lineNumber, column: skipped.column },
            remediation: "Keep the test active and fix the implementation or test setup that prevents it from passing.",
          }),
        );
      }

      if (!namedTestFile) {
        continue;
      }

      const removedAssertions = removed.filter((line) => matchesAny(line.content, ASSERTION_PATTERNS)).length;
      const addedAssertions = added.filter((line) => matchesAny(line.content, ASSERTION_PATTERNS)).length;
      if (removedAssertions > addedAssertions) {
        const netRemoved = removedAssertions - addedAssertions;
        findings.push(
          makeFinding({
            ruleId: "test-integrity.assertions-reduced",
            title: "Test assertions reduced",
            description: `${path} removes ${netRemoved} more assertion line${netRemoved === 1 ? "" : "s"} than it adds.`,
            severity: "warning",
            relatedFiles: [path],
            fingerprintParts: [path, removedAssertions, addedAssertions],
            location: { path },
            remediation: "Confirm that the removed assertions are preserved by equivalent or stronger checks.",
          }),
        );
      }

      const strongAssertionsRemoved = removed.filter((line) =>
        matchesAny(line.content, STRONG_ASSERTION_PATTERNS),
      ).length;
      const weakAssertionsAdded = added.filter((line) =>
        matchesAny(line.content, WEAK_ASSERTION_PATTERNS),
      ).length;
      if (strongAssertionsRemoved > 0 && weakAssertionsAdded > 0) {
        findings.push(
          makeFinding({
            ruleId: "test-integrity.assertion-weakened",
            title: "Specific assertion replaced by a weaker check",
            description: `${path} replaces at least one specific outcome check with a broad truthiness or existence check.`,
            severity: "warning",
            relatedFiles: [path],
            fingerprintParts: [path, strongAssertionsRemoved, weakAssertionsAdded],
            location: { path },
            remediation: "Assert the exact expected value, error, or state transition instead of only checking truthiness or existence.",
          }),
        );
      }

      const removedTests = removed.filter((line) => matchesAny(line.content, TEST_DECLARATION_PATTERNS)).length;
      const addedTests = added.filter((line) => matchesAny(line.content, TEST_DECLARATION_PATTERNS)).length;
      if (removedTests > addedTests) {
        const netRemoved = removedTests - addedTests;
        findings.push(
          makeFinding({
            ruleId: "test-integrity.test-cases-reduced",
            title: "Test cases reduced",
            description: `${path} removes ${netRemoved} more test case${netRemoved === 1 ? "" : "s"} than it adds.`,
            severity: "warning",
            relatedFiles: [path],
            fingerprintParts: [path, removedTests, addedTests],
            location: { path },
            remediation: "Restore the removed cases or document the equivalent replacement coverage for review.",
          }),
        );
      }
    }

    sortFindings(findings);
    const relatedFiles = uniqueSortedPaths(inspectedFiles);
    return {
      findings,
      evidence: [
        makeEvidence({
          analyzerId: TEST_INTEGRITY_ANALYZER_ID,
          patch: context.patch,
          status: evidenceStatusForFindings(findings),
          startedAt,
          summary:
            findings.length === 0
              ? `Test integrity checks passed across ${relatedFiles.length} relevant file${relatedFiles.length === 1 ? "" : "s"}.`
              : `${findings.length} test integrity issue${findings.length === 1 ? "" : "s"} detected.`,
          relatedFiles,
          metadata: {
            inspectedTestFiles: relatedFiles.length,
            deletedTestFiles: findings.filter(
              (finding) => finding.ruleId === "test-integrity.test-file-deleted",
            ).length,
            skippedTestsAdded: findings.filter((finding) => finding.ruleId === "test-integrity.skip-added")
              .length,
          },
        }),
      ],
    };
  },
};
