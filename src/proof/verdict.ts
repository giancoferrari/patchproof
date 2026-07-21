import type {
  EvaluatedClaim,
  EvidenceRecord,
  Finding,
  PatchProofPolicy,
  ProofVerdict,
} from "../types.js";

function isRequiredCommand(record: EvidenceRecord, policy: PatchProofPolicy): boolean {
  if (record.type !== "command") return false;
  const commandId = record.metadata["commandId"];
  if (typeof commandId !== "string") return false;
  return policy.commands.some((command) => command.id === commandId && command.required);
}

export function computeVerdict(
  policy: PatchProofPolicy,
  claims: EvaluatedClaim[],
  evidence: EvidenceRecord[],
  findings: Finding[],
): ProofVerdict {
  const blockingFindings = findings.filter((finding) => finding.severity === "blocking").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const provenClaims = claims.filter((claim) => claim.status === "proven").length;
  const disprovenClaims = claims.filter((claim) => claim.status === "disproven").length;
  const unprovenClaims = claims.filter((claim) => claim.status === "unproven").length;
  const requiredCommands = policy.commands.filter((command) => command.required);
  const requiredCommandEvidence = evidence.filter((record) => isRequiredCommand(record, policy));
  const requiredCommandsPassed = new Set(
    requiredCommandEvidence
      .filter((record) => record.status === "passed")
      .map((record) => String(record.metadata["commandId"])),
  ).size;
  const requiredCommandFailed = requiredCommandEvidence.some(
    (record) => record.status === "failed" || record.status === "error",
  );
  const blockingClaimDisproven = claims.some(
    (claim) => claim.severity === "blocking" && claim.status === "disproven",
  );
  const blockingClaimUnproven = claims.some(
    (claim) => claim.severity === "blocking" && claim.status === "unproven",
  );

  let status: ProofVerdict["status"];
  let summary: string;
  if (blockingFindings > 0 || requiredCommandFailed || blockingClaimDisproven) {
    status = "rejected";
    summary = "The patch has blocking findings or disproven required claims.";
  } else if (
    blockingClaimUnproven ||
    requiredCommandsPassed < requiredCommands.length ||
    disprovenClaims > 0 ||
    unprovenClaims > 0
  ) {
    status = "incomplete";
    summary = "No blocking failure was found, but one or more claims lack passing support.";
  } else {
    status = "verified";
    summary = "Every required command and claim is supported by passing evidence.";
  }

  return {
    status,
    summary,
    blockingFindings,
    warnings,
    provenClaims,
    disprovenClaims,
    unprovenClaims,
    requiredCommandsPassed,
    requiredCommandsTotal: requiredCommands.length,
  };
}
