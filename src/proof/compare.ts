import type { ClaimStatus, EvidenceStatus, Finding, ProofBundle, VerdictStatus } from "../types.js";
import { verifyProofBundle } from "./bundle.js";
import { markdownText } from "./summary.js";

export interface ProofComparison {
  baseline: { id: string; head: string; verdict: VerdictStatus };
  candidate: { id: string; head: string; verdict: VerdictStatus };
  comparable: boolean;
  warnings: string[];
  findings: { added: Finding[]; resolved: Finding[]; persistent: Finding[]; escalated: Finding[] };
  claims: Array<{ id: string; before: ClaimStatus | "missing"; after: ClaimStatus | "missing" }>;
  commands: Array<{ id: string; before: EvidenceStatus | "missing"; after: EvidenceStatus | "missing" }>;
  regressions: string[];
}

function commandStatus(bundle: ProofBundle, id: string): EvidenceStatus | "missing" {
  const records = bundle.evidence.filter((record) => record.type === "command" && record.metadata["commandId"] === id);
  for (const status of ["error", "failed", "skipped", "passed"] as const) {
    if (records.some((record) => record.status === status)) return status;
  }
  return "missing";
}

/** Compare only validated evidence. A changed trust basis makes a regression gate inconclusive. */
export function compareProofBundles(baseline: ProofBundle, candidate: ProofBundle): ProofComparison {
  for (const [label, bundle] of [["baseline", baseline], ["candidate", candidate]] as const) {
    const verification = verifyProofBundle(bundle);
    if (!verification.valid) throw new Error(`Invalid ${label} proof: ${verification.errors.join(" ")}`);
  }
  const warnings: string[] = [];
  for (const [name, before, after] of [
    ["repository name", baseline.patch.repositoryName, candidate.patch.repositoryName],
    ["base commit", baseline.patch.baseCommit, candidate.patch.baseCommit],
    ["policy digest", baseline.policy.seal.digest, candidate.policy.seal.digest],
    ["policy source", baseline.policy.seal.source, candidate.policy.seal.source],
    ["policy path", baseline.policy.seal.path, candidate.policy.seal.path],
    ["contract digest", baseline.contract.digest, candidate.contract.digest],
    ["generator version", baseline.generator.version, candidate.generator.version],
  ]) {
    if (before !== after) warnings.push(`The ${name} changed; results do not share the same verification basis.`);
  }
  const key = (finding: Finding): string => `${finding.ruleId}:${finding.fingerprint}`;
  const previous = new Map(baseline.findings.map((finding) => [key(finding), finding]));
  const current = new Map(candidate.findings.map((finding) => [key(finding), finding]));
  const severity = { info: 0, warning: 1, blocking: 2 };
  const findings = {
    added: candidate.findings.filter((finding) => !previous.has(key(finding))),
    resolved: baseline.findings.filter((finding) => !current.has(key(finding))),
    persistent: candidate.findings.filter((finding) => previous.has(key(finding))),
    escalated: candidate.findings.filter((finding) => {
      const before = previous.get(key(finding));
      return before !== undefined && severity[finding.severity] > severity[before.severity];
    }),
  };
  const regressions = [...findings.added, ...findings.escalated]
    .filter((finding) => finding.severity !== "info")
    .map((finding) => `${finding.severity} finding: ${finding.title}`);
  const claimIds = [...new Set([...baseline.claims, ...candidate.claims].map((claim) => claim.id))].sort();
  const claims: ProofComparison["claims"] = [];
  const claimRank = { proven: 2, unproven: 1, disproven: 0, missing: -1 };
  for (const id of claimIds) {
    const before = baseline.claims.find((claim) => claim.id === id)?.status ?? "missing";
    const after = candidate.claims.find((claim) => claim.id === id)?.status ?? "missing";
    if (before !== after) claims.push({ id, before, after });
    if (claimRank[after] < claimRank[before]) regressions.push(`Claim ${id}: ${before} -> ${after}`);
  }
  const commandIds = [...new Set([...baseline.policy.value.commands, ...candidate.policy.value.commands].map((command) => command.id))].sort();
  const commands: ProofComparison["commands"] = [];
  for (const id of commandIds) {
    const before = commandStatus(baseline, id);
    const after = commandStatus(candidate, id);
    if (before !== after) commands.push({ id, before, after });
    if (before === "passed" && after !== "passed") regressions.push(`Command ${id}: ${before} -> ${after}`);
  }
  const verdictRank = { verified: 3, incomplete: 2, rejected: 1, error: 0 };
  if (verdictRank[candidate.verdict.status] < verdictRank[baseline.verdict.status]) {
    regressions.push(`Verdict: ${baseline.verdict.status} -> ${candidate.verdict.status}`);
  }
  return {
    baseline: { id: baseline.id, head: baseline.patch.headCommit, verdict: baseline.verdict.status },
    candidate: { id: candidate.id, head: candidate.patch.headCommit, verdict: candidate.verdict.status },
    comparable: warnings.length === 0, warnings, findings, claims, commands, regressions,
  };
}

export function renderProofComparison(comparison: ProofComparison): string {
  const text = markdownText;
  const lines = ["## PatchProof comparison", "",
    `**Before:** ${text(comparison.baseline.head)} (${comparison.baseline.verdict})  `,
    `**After:** ${text(comparison.candidate.head)} (${comparison.candidate.verdict})`, "",
    `**Assessment:** ${!comparison.comparable ? "inconclusive: verification basis changed" : comparison.regressions.length ? `${comparison.regressions.length} regressions detected` : "no regressions detected"}`, "",
  ];
  for (const warning of comparison.warnings) lines.push(`> ${text(warning)}`, "");
  lines.push("| Findings | Count |", "| --- | --- |",
    `| New | ${comparison.findings.added.length} |`,
    `| Absent from candidate | ${comparison.findings.resolved.length} |`,
    `| Persistent | ${comparison.findings.persistent.length} |`,
    `| Severity increased | ${comparison.findings.escalated.length} |`, "");
  if (comparison.regressions.length) {
    lines.push("### Regressions", "");
    for (const regression of comparison.regressions.slice(0, 50)) lines.push(`- ${text(regression)}`);
    if (comparison.regressions.length > 50) lines.push(`- ${comparison.regressions.length - 50} more in JSON output.`);
    lines.push("");
  }
  for (const [title, findings] of [["New findings", comparison.findings.added], ["Findings absent from candidate", comparison.findings.resolved]] as const) {
    if (!findings.length) continue;
    lines.push(`### ${title}`, "");
    for (const finding of findings.slice(0, 30)) {
      lines.push(`- **${finding.severity}: ${text(finding.title)}**${finding.location ? ` (${text(finding.location.path)})` : ""}`);
      if (title === "New findings" && finding.remediation) lines.push(`  - Fix: ${text(finding.remediation)}`);
    }
    if (findings.length > 30) lines.push(`- ${findings.length - 30} more in JSON output.`);
    lines.push("");
  }
  for (const [label, changes] of [["Claims", comparison.claims], ["Commands", comparison.commands]] as const) {
    if (!changes.length) continue;
    lines.push(`### ${label}`, "", "| ID | Before | After |", "| --- | --- | --- |");
    for (const change of changes) lines.push(`| ${text(change.id)} | ${change.before} | ${change.after} |`);
    lines.push("");
  }
  lines.push("Findings are matched by rule and fingerprint. An absent finding is not proof of a fix; inspect the changed evidence. Verify both proofs against trusted keys and expected commits before using this comparison as a gate.", "");
  return lines.join("\n");
}
