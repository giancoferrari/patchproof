import type { ProofBundle } from "../types.js";
import { verifyProofBundle } from "./bundle.js";

/** Keep repository-controlled text inert in Markdown, HTML, and GitHub mentions. */
export function markdownText(value: string, limit = 1000): string {
  return value.slice(0, limit).replace(/[\r\n\t]/gu, " ").replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/[&<>`*_[\]{}()|#!\\~@]/gu, (character) => `&#${character.charCodeAt(0)};`);
}

export function renderProofSummary(bundle: ProofBundle): string {
  const verification = verifyProofBundle(bundle);
  if (!verification.valid) throw new Error(`Refusing to summarize an invalid proof bundle: ${verification.errors.join(" ")}`);
  const text = markdownText;
  const lines = [
    `## PatchProof: ${bundle.verdict.status}`,
    "", text(bundle.verdict.summary), "",
    "| Check | Result |", "| --- | --- |",
    `| Claims supported | ${bundle.verdict.provenClaims}/${bundle.claims.length} |`,
    `| Required commands passed | ${bundle.verdict.requiredCommandsPassed}/${bundle.verdict.requiredCommandsTotal} |`,
    `| Findings | ${bundle.verdict.blockingFindings} blocking, ${bundle.verdict.warnings} warnings |`,
    `| Patch | ${bundle.patch.stats.filesChanged} files, +${bundle.patch.stats.additions}/-${bundle.patch.stats.deletions} lines |`,
    "", `**Repository:** ${text(bundle.patch.repositoryName)}`,
    `**Base:** ${text(bundle.patch.baseCommit)}  `,
    `**Head:** ${text(bundle.patch.headCommit)}`, "",
    `**Policy source:** ${text(bundle.policy.seal.source)}`,
    `**Signature:** ${verification.signature === "valid" ? `valid; key ${text(bundle.attestation!.keyId)} (trust not checked)` : "unsigned"}`,
    `**Contract digest:** ${text(bundle.contract.digest)}`, "",
  ];
  if (bundle.policy.seal.source !== "base-commit") {
    lines.push("> The candidate checkout supplied the policy. Review this trust exception before accepting the proof.", "");
  }
  if (bundle.patch.stats.filesChanged === 0) {
    lines.push("> This comparison contains no changed files. Confirm the intended base and head commits.", "");
  }
  lines.push("### Findings and fixes", "");
  const findings = bundle.findings.slice().sort((a, b) => {
    const order = { blocking: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity] || a.id.localeCompare(b.id);
  });
  if (findings.length === 0) lines.push("No findings.", "");
  for (const finding of findings.slice(0, 30)) {
    const location = finding.location ? ` (${text(finding.location.path)}${finding.location.line ? `:${finding.location.line}` : ""})` : "";
    lines.push(`- **${finding.severity}: ${text(finding.title)}**${location}. ${text(finding.description)}`);
    if (finding.remediation) lines.push(`  - Fix: ${text(finding.remediation)}`);
  }
  if (findings.length > 30) lines.push(`- ${findings.length - 30} more findings in the full proof.`);
  lines.push("", "### Command evidence", "", "| Command | Required | Status | Duration |", "| --- | --- | --- | --- |" );
  for (const command of bundle.policy.value.commands) {
    const records = bundle.evidence.filter((record) => record.type === "command" && record.metadata["commandId"] === command.id);
    lines.push(`| ${text(command.id)} | ${command.required ? "yes" : "no"} | ${records.length ? records.map((record) => record.status).join(", ") : "missing"} | ${records.reduce((sum, record) => sum + record.durationMs, 0)} ms |`);
  }
  if (bundle.policy.value.commands.length === 0) lines.push("| No commands configured | | | |");
  if (bundle.evidence.some((record) => record.metadata["stdoutTruncated"] || record.metadata["stderrTruncated"])) {
    lines.push("", "> Some command output was truncated. Inspect the full proof's evidence metadata.");
  }
  lines.push("", "### Claims", "", "| Claim | Status | Evidence assessment |", "| --- | --- | --- |");
  for (const claim of bundle.claims.slice(0, 30)) {
    lines.push(`| ${text(claim.statement)} | ${claim.status} | ${text(claim.explanation)} |`);
  }
  if (bundle.claims.length > 30) lines.push("", `${bundle.claims.length - 30} more claims in the full proof.`);
  lines.push("", "---", "", `Proof: ${text(bundle.id)}`, "",
    "This summary describes recorded evidence. Bundle integrity does not establish signer identity or prove arbitrary semantic correctness.", "");
  return lines.join("\n");
}
