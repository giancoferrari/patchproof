import { createHash } from "node:crypto";

import type {
  AnalyzerContext,
  EvidenceRecord,
  EvidenceStatus,
  FileChange,
  Finding,
  FindingLocation,
  PatchSnapshot,
  Severity,
} from "../types.js";

export interface DiffLine {
  kind: "added" | "removed" | "context";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface FindingInput {
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  relatedFiles: string[];
  fingerprintParts: readonly (string | number | boolean | null)[];
  location?: FindingLocation;
  remediation?: string;
}

export interface EvidenceInput {
  analyzerId: string;
  patch: PatchSnapshot;
  status: EvidenceStatus;
  summary: string;
  relatedFiles: string[];
  metadata?: Record<string, unknown>;
  details?: string;
  startedAt?: Date;
}

const TEST_DIRECTORY_PATTERN = /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)/i;
const TEST_BASENAME_PATTERN = /(?:^|[._-])(?:test|tests|spec|specs)(?:[._-]|$)/i;

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function stableHash(parts: readonly (string | number | boolean | null)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    const value = part === null ? "<null>" : String(part);
    hash.update(String(Buffer.byteLength(value)), "utf8");
    hash.update(":", "utf8");
    hash.update(value, "utf8");
    hash.update(";", "utf8");
  }
  return hash.digest("hex");
}

export function makeFinding(input: FindingInput): Finding {
  const relatedFiles = uniqueSortedPaths(input.relatedFiles);
  const fingerprint = stableHash([
    input.ruleId,
    ...input.fingerprintParts,
    ...relatedFiles,
  ]);
  const finding: Finding = {
    id: `${input.ruleId}:${fingerprint.slice(0, 16)}`,
    ruleId: input.ruleId,
    title: input.title,
    description: input.description,
    severity: input.severity,
    relatedFiles,
    fingerprint,
  };
  if (input.location !== undefined) {
    finding.location = {
      path: normalizePath(input.location.path),
      ...(input.location.line !== undefined ? { line: input.location.line } : {}),
      ...(input.location.column !== undefined ? { column: input.location.column } : {}),
    };
  }
  if (input.remediation !== undefined) {
    finding.remediation = input.remediation;
  }
  return finding;
}

export function makeEvidence(input: EvidenceInput): Omit<EvidenceRecord, "previousDigest" | "digest"> {
  const completedAt = new Date();
  const startedAt = input.startedAt ?? completedAt;
  const relatedFiles = uniqueSortedPaths(input.relatedFiles);
  const idHash = stableHash([
    "rule-evidence",
    input.analyzerId,
    input.patch.diffDigest,
    input.status,
  ]);
  const evidence: Omit<EvidenceRecord, "previousDigest" | "digest"> = {
    id: `evidence:${input.analyzerId}:${idHash.slice(0, 16)}`,
    type: "rule",
    producer: `patchproof/analyzer/${input.analyzerId}`,
    status: input.status,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    summary: input.summary,
    relatedFiles,
    metadata: {
      ruleId: input.analyzerId,
      ...(input.metadata ?? {}),
    },
  };
  if (input.details !== undefined) {
    evidence.details = input.details;
  }
  return evidence;
}

export function evidenceStatusForFindings(findings: readonly Finding[]): EvidenceStatus {
  return findings.some((finding) => finding.severity !== "info") ? "failed" : "passed";
}

export function uniqueSortedPaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map(normalizePath).filter((path) => path.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function parseUnifiedPatch(patch: string | undefined): DiffLine[] {
  if (patch === undefined || patch.length === 0) {
    return [];
  }

  const lines = patch.split(/\r?\n/);
  const parsed: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunk = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
    if (hunk !== null) {
      oldLine = Number.parseInt(hunk[1] ?? "0", 10);
      newLine = Number.parseInt(hunk[2] ?? "0", 10);
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\ No newline at end of file")) {
      continue;
    }
    if (line.startsWith("+")) {
      parsed.push({ kind: "added", content: line.slice(1), oldLine: null, newLine });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      parsed.push({ kind: "removed", content: line.slice(1), oldLine, newLine: null });
      oldLine += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      parsed.push({ kind: "context", content: line.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
  }
  return parsed;
}

export function patchForFile(patch: PatchSnapshot, file: FileChange): string | undefined {
  if (file.patch !== undefined) {
    return file.patch;
  }
  if (patch.diff.length === 0) {
    return undefined;
  }

  const normalizedPath = normalizePath(file.path);
  const marker = `diff --git a/${normalizePath(file.previousPath ?? file.path)} b/${normalizedPath}`;
  const start = patch.diff.indexOf(marker);
  if (start < 0) {
    return undefined;
  }
  const next = patch.diff.indexOf("\ndiff --git ", start + marker.length);
  return patch.diff.slice(start, next < 0 ? undefined : next + 1);
}

export async function changedLinesForFile(
  context: AnalyzerContext,
  file: FileChange,
): Promise<DiffLine[]> {
  const parsed = parseUnifiedPatch(patchForFile(context.patch, file));
  if (parsed.length > 0) {
    return parsed;
  }

  if (file.kind !== "added" && file.kind !== "deleted") {
    return [];
  }
  const ref = file.kind === "added" ? context.patch.headCommit : context.patch.baseCommit;
  const path = normalizePath(file.kind === "deleted" ? file.previousPath ?? file.path : file.path);
  const content = await context.getFileAtRef(ref, path);
  if (content === null) {
    return [];
  }
  return content.split(/\r?\n/).map((line, index) => ({
    kind: file.kind === "added" ? "added" : "removed",
    content: line,
    oldLine: file.kind === "deleted" ? index + 1 : null,
    newLine: file.kind === "added" ? index + 1 : null,
  }));
}

export function changedPaths(file: FileChange): string[] {
  return uniqueSortedPaths([
    file.path,
    ...(file.previousPath === undefined ? [] : [file.previousPath]),
  ]);
}

export function isTestFile(path: string): boolean {
  const normalized = normalizePath(path);
  const lower = normalized.toLowerCase();
  const basename = lower.slice(lower.lastIndexOf("/") + 1);

  if (/_test\.go$/i.test(basename)) {
    return true;
  }
  if (/^(?:test_.+|.+_test)\.py$/i.test(basename)) {
    return true;
  }
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(basename)) {
    return true;
  }
  if (/\.(?:test|spec)\.py$/i.test(basename)) {
    return true;
  }
  if (lower.endsWith(".rs") && TEST_DIRECTORY_PATTERN.test(lower)) {
    return true;
  }
  if (TEST_DIRECTORY_PATTERN.test(lower) && /\.(?:[cm]?[jt]sx?|py|go|rs)$/i.test(basename)) {
    return true;
  }
  return TEST_BASENAME_PATTERN.test(basename) && /\.(?:[cm]?[jt]sx?|py|go|rs)$/i.test(basename);
}

export function isSourceFile(path: string): boolean {
  const normalized = normalizePath(path);
  const lower = normalized.toLowerCase();
  if (isTestFile(lower)) {
    return false;
  }
  if (
    /(?:^|\/)(?:docs?|examples?|fixtures?|snapshots?|vendor|node_modules|dist|build|coverage|generated)(?:\/|$)/i.test(
      lower,
    )
  ) {
    return false;
  }
  if (/\.(?:config|stories|story)\.[cm]?[jt]sx?$/i.test(lower) || lower.endsWith(".d.ts")) {
    return false;
  }
  return /\.(?:c|cc|cpp|cxx|cs|go|java|js|jsx|kt|kts|mjs|mts|php|py|rb|rs|swift|ts|tsx|vue|svelte)$/i.test(
    lower,
  );
}

export function isCommentOnly(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:\/\/|\/\*|\*|#(?!\[)|--)/.test(trimmed);
}

export function sortFindings(findings: Finding[]): Finding[] {
  return findings.sort((left, right) => {
    const leftPath = left.location?.path ?? left.relatedFiles[0] ?? "";
    const rightPath = right.location?.path ?? right.relatedFiles[0] ?? "";
    const pathOrder = leftPath.localeCompare(rightPath);
    if (pathOrder !== 0) {
      return pathOrder;
    }
    const lineOrder = (left.location?.line ?? 0) - (right.location?.line ?? 0);
    return lineOrder !== 0 ? lineOrder : left.ruleId.localeCompare(right.ruleId);
  });
}
