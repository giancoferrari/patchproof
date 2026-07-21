import { minimatch } from "minimatch";
import type {
  ClaimDefinition,
  EvaluatedClaim,
  EvidenceRecord,
  Finding,
  PatchSnapshot,
} from "../types.js";

function commandId(record: EvidenceRecord): string | undefined {
  const value = record.metadata["commandId"];
  if (typeof value === "string") return value;
  return record.producer.startsWith("command:")
    ? record.producer.slice("command:".length)
    : undefined;
}

function ruleId(record: EvidenceRecord): string | undefined {
  const value = record.metadata["ruleId"];
  if (typeof value === "string") return value;
  return record.type === "rule" ? record.producer : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function evaluateClaim(
  claim: ClaimDefinition,
  evidence: EvidenceRecord[],
  findings: Finding[],
  patch: PatchSnapshot,
): EvaluatedClaim {
  const evidenceIds: string[] = [];
  const findingIds: string[] = [];
  const unmet: string[] = [];
  const failures: string[] = [];
  let requirements = 0;

  for (const requiredCommand of claim.evidence.commands ?? []) {
    requirements += 1;
    const matches = evidence.filter(
      (record) => record.type === "command" && commandId(record) === requiredCommand,
    );
    evidenceIds.push(...matches.map((record) => record.id));
    if (matches.length === 0) {
      unmet.push(`command ${requiredCommand} did not run`);
    } else if (matches.some((record) => record.status === "failed" || record.status === "error")) {
      failures.push(`command ${requiredCommand} failed`);
    } else if (!matches.some((record) => record.status === "passed")) {
      unmet.push(`command ${requiredCommand} did not produce passing evidence`);
    }
  }

  for (const requiredRule of claim.evidence.rules ?? []) {
    requirements += 1;
    const matches = evidence.filter(
      (record) => record.type === "rule" && ruleId(record) === requiredRule,
    );
    const ruleFindings = findings.filter((finding) => finding.ruleId === requiredRule);
    evidenceIds.push(...matches.map((record) => record.id));
    findingIds.push(...ruleFindings.map((finding) => finding.id));
    if (matches.length === 0) {
      unmet.push(`rule ${requiredRule} did not run`);
    } else if (
      matches.some((record) => record.status === "failed" || record.status === "error") ||
      ruleFindings.some((finding) => finding.severity === "blocking")
    ) {
      failures.push(`rule ${requiredRule} found a blocking condition`);
    } else if (!matches.some((record) => record.status === "passed")) {
      unmet.push(`rule ${requiredRule} did not pass`);
    }
  }

  for (const pattern of claim.evidence.paths ?? []) {
    requirements += 1;
    const matchingPaths = patch.files
      .map((file) => file.path)
      .filter((path) => minimatch(path, pattern, { dot: true }));
    if (matchingPaths.length === 0) {
      unmet.push(`no changed file matched ${pattern}`);
    }
  }

  if (claim.evidence.requireTestChange === true) {
    requirements += 1;
    if (patch.stats.testFilesChanged === 0) {
      unmet.push("no test file changed");
    }
  }

  let status: EvaluatedClaim["status"];
  let explanation: string;
  if (failures.length > 0) {
    status = "disproven";
    explanation = failures.join("; ");
  } else if (requirements === 0) {
    status = "unproven";
    explanation = "The claim has no evidence requirements.";
  } else if (unmet.length > 0) {
    status = "unproven";
    explanation = unmet.join("; ");
  } else {
    status = "proven";
    explanation = `All ${requirements} evidence requirement${requirements === 1 ? "" : "s"} passed.`;
  }

  return {
    ...claim,
    status,
    evidenceIds: unique(evidenceIds),
    findingIds: unique(findingIds),
    explanation,
  };
}

export function evaluateClaims(
  claims: ClaimDefinition[],
  evidence: EvidenceRecord[],
  findings: Finding[],
  patch: PatchSnapshot,
): EvaluatedClaim[] {
  return claims.map((claim) => evaluateClaim(claim, evidence, findings, patch));
}
