import type { Analyzer, AnalyzerResult, Severity } from "../types.js";
import {
  changedLinesForFile,
  evidenceStatusForFindings,
  makeEvidence,
  makeFinding,
  normalizePath,
  sortFindings,
  stableHash,
  uniqueSortedPaths,
} from "./utils.js";

export const SECRET_SCAN_ANALYZER_ID = "secret-scan";

interface SecretDetector {
  id: string;
  label: string;
  pattern: RegExp;
  captureGroup: number;
  severity: Severity;
  generic?: boolean;
}

interface SecretMatch {
  detector: SecretDetector;
  start: number;
  end: number;
  value: string;
}

const DETECTORS: readonly SecretDetector[] = [
  {
    id: "private-key",
    label: "private key material",
    pattern: /-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/,
    captureGroup: 0,
    severity: "blocking",
  },
  {
    id: "github-token",
    label: "GitHub access token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{30,255})\b/,
    captureGroup: 0,
    severity: "blocking",
  },
  {
    id: "aws-access-key",
    label: "AWS access key identifier",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    captureGroup: 0,
    severity: "blocking",
  },
  {
    id: "google-api-key",
    label: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    captureGroup: 0,
    severity: "blocking",
  },
  {
    id: "slack-token",
    label: "Slack token",
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,200}\b/,
    captureGroup: 0,
    severity: "blocking",
  },
  {
    id: "stripe-live-key",
    label: "Stripe live secret key",
    pattern: /\bsk_live_[0-9A-Za-z]{16,200}\b/,
    captureGroup: 0,
    severity: "blocking",
  },
  {
    id: "jwt",
    label: "JSON Web Token",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    captureGroup: 0,
    severity: "blocking",
  },
  {
    id: "npm-auth-token",
    label: "npm authentication token",
    pattern: /(?:^|\s)_authToken\s*=\s*([^\s#]{8,})/,
    captureGroup: 1,
    severity: "blocking",
  },
  {
    id: "credentialed-uri",
    label: "credential embedded in a URI",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s/@]{4,})@/i,
    captureGroup: 1,
    severity: "blocking",
  },
  {
    id: "generic-quoted-secret",
    label: "hard-coded credential",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*(["'`])([^"'`\r\n]{8,})\1/i,
    captureGroup: 2,
    severity: "warning",
    generic: true,
  },
  {
    id: "generic-unquoted-secret",
    label: "hard-coded credential",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*([A-Za-z0-9/+_.=-]{12,})/i,
    captureGroup: 1,
    severity: "warning",
    generic: true,
  },
];

function isPlaceholder(value: string, generic: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    /^(?:x+|\*+|-+|_+)$/.test(normalized) ||
    /^(?:your[_ -]?(?:api[_ -]?)?(?:key|token|secret|password)|changeme|change-me|replace-me|redacted|placeholder|not-a-secret|null|undefined)$/i.test(
      normalized,
    ) ||
    /^(?:example|sample|dummy|fake|test)[-_]/i.test(normalized) ||
    normalized.includes("${") ||
    normalized.includes("{{") ||
    normalized.includes("process.env") ||
    normalized.includes("os.getenv") ||
    (normalized.startsWith("<") && normalized.endsWith(">"))
  ) {
    return true;
  }

  const compact = normalized.replace(/[^a-z0-9]/g, "");
  if (!generic && compact.length >= 12 && new Set(compact).size <= 3) {
    return true;
  }
  if (!generic) {
    return false;
  }

  const classes = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(
    Boolean,
  ).length;
  return value.length < 16 && classes < 3;
}

function findMatches(line: string, detector: SecretDetector): SecretMatch[] {
  const flags = detector.pattern.flags.includes("g") ? detector.pattern.flags : `${detector.pattern.flags}g`;
  const pattern = new RegExp(detector.pattern.source, flags);
  const matches: SecretMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    const value = match[detector.captureGroup];
    if (value === undefined || isPlaceholder(value, detector.generic === true)) {
      continue;
    }
    const relativeStart = detector.captureGroup === 0 ? 0 : match[0].indexOf(value);
    if (relativeStart < 0) {
      continue;
    }
    const start = match.index + relativeStart;
    matches.push({ detector, start, end: start + value.length, value });
  }
  return matches;
}

function overlaps(left: SecretMatch, right: SecretMatch): boolean {
  return left.start < right.end && right.start < left.end;
}

function detectSecrets(line: string): SecretMatch[] {
  const accepted: SecretMatch[] = [];
  for (const detector of DETECTORS) {
    for (const match of findMatches(line, detector)) {
      if (accepted.some((existing) => overlaps(existing, match))) {
        continue;
      }
      accepted.push(match);
    }
  }
  return accepted.sort((left, right) => left.start - right.start);
}

function redactedPreview(line: string, matches: readonly SecretMatch[]): string {
  let preview = line;
  for (const match of [...matches].sort((left, right) => right.start - left.start)) {
    preview = `${preview.slice(0, match.start)}[REDACTED]${preview.slice(match.end)}`;
  }
  const trimmed = preview.trim();
  return trimmed.length <= 180 ? trimmed : `${trimmed.slice(0, 177)}...`;
}

export const secretScanAnalyzer: Analyzer = {
  id: SECRET_SCAN_ANALYZER_ID,
  async analyze(context): Promise<AnalyzerResult> {
    const startedAt = new Date();
    const findings = [];
    const detections: Array<{
      detector: string;
      path: string;
      line: number;
      preview: string;
    }> = [];

    for (const file of context.patch.files) {
      if (file.binary || file.kind === "deleted") {
        continue;
      }
      const path = normalizePath(file.path);
      const lines = await changedLinesForFile(context, file);
      for (const line of lines) {
        if (line.kind !== "added") {
          continue;
        }
        const matches = detectSecrets(line.content);
        if (matches.length === 0) {
          continue;
        }
        const preview = redactedPreview(line.content, matches);
        const lineNumber = line.newLine ?? 1;
        for (const match of matches) {
          const secretDigest = stableHash([match.detector.id, match.value]);
          findings.push(
            makeFinding({
              ruleId: `secret-scan.${match.detector.id}`,
              title: `Potential ${match.detector.label} detected`,
              description: `An added line in ${path} appears to contain ${match.detector.label}. The matched value has been redacted.`,
              severity: match.detector.severity,
              relatedFiles: [path],
              fingerprintParts: [path, match.detector.id, secretDigest],
              location: { path, line: lineNumber, column: match.start + 1 },
              remediation: "Remove the value from the patch, rotate it if it was live, and load it from an approved secret store or environment variable.",
            }),
          );
          detections.push({
            detector: match.detector.id,
            path,
            line: lineNumber,
            preview,
          });
        }
      }
    }

    sortFindings(findings);
    const relatedFiles = uniqueSortedPaths(detections.map((detection) => detection.path));
    return {
      findings,
      evidence: [
        makeEvidence({
          analyzerId: SECRET_SCAN_ANALYZER_ID,
          patch: context.patch,
          status: evidenceStatusForFindings(findings),
          startedAt,
          summary:
            findings.length === 0
              ? "No likely secrets were found in added text lines."
              : `${findings.length} potential secret${findings.length === 1 ? "" : "s"} detected; matched values were redacted.`,
          relatedFiles,
          metadata: {
            scannedFiles: context.patch.files.filter((file) => !file.binary && file.kind !== "deleted").length,
            detections,
            redaction: "Matched values are replaced with [REDACTED].",
          },
        }),
      ],
    };
  },
};
