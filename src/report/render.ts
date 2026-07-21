import type { EvaluatedClaim, EvidenceRecord, Finding, ProofBundle } from "../types.js";
import { escapeHtml, safeJson } from "./escape.js";
import {
  claimIcon,
  evidenceIcon,
  icon,
  severityIcon,
  verdictIcon,
} from "./icons.js";
import { REPORT_SCRIPT } from "./script.js";
import { REPORT_STYLES } from "./styles.js";

function short(value: string, length = 12): string {
  return value.length <= length ? value : value.slice(0, length);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function status(statusValue: string, kind = "status"): string {
  const escaped = escapeHtml(statusValue);
  const statusIcon =
    statusValue === "proven"
      ? claimIcon("proven")
      : statusValue === "disproven"
        ? claimIcon("disproven")
        : statusValue === "unproven"
          ? claimIcon("unproven")
          : statusValue === "passed"
            ? evidenceIcon("passed")
            : statusValue === "failed"
              ? evidenceIcon("failed")
              : statusValue === "skipped"
                ? evidenceIcon("skipped")
                : statusValue === "error"
                  ? evidenceIcon("error")
                  : statusValue === "verified" || statusValue === "rejected" || statusValue === "incomplete"
                    ? verdictIcon(statusValue)
                    : icon("info");
  return `<span class="status ${kind}-${escaped}">${statusIcon}${escaped.replace(/^./, (letter) => letter.toUpperCase())}</span>`;
}

function copyButton(value: string): string {
  return `<button class="copy" type="button" data-copy="${escapeHtml(value)}" data-copied="false" aria-label="Copy value">${icon("copy")}</button>`;
}

function nav(): string {
  return `
    <aside class="rail" aria-label="Report navigation">
      <div class="brand"><span class="brand-mark">${icon("shield")}</span><span>PatchProof</span></div>
      <nav>
        <a href="#overview" aria-current="true">Overview</a>
        <a href="#claims">Claims</a>
        <a href="#findings">Findings</a>
        <a href="#evidence">Evidence</a>
        <a href="#files">Files</a>
        <a href="#integrity">Integrity</a>
      </nav>
      <div class="rail-meta">Portable proof bundle<code>schema 1.0</code></div>
    </aside>`;
}

function metrics(bundle: ProofBundle): string {
  const passed = bundle.evidence.filter((record) => record.status === "passed").length;
  return `<dl class="metrics">
    <div class="metric"><dt>Claims proven</dt><dd>${bundle.verdict.provenClaims}/${bundle.claims.length}</dd></div>
    <div class="metric"><dt>Evidence passed</dt><dd>${passed}/${bundle.evidence.length}</dd></div>
    <div class="metric"><dt>Blocking findings</dt><dd>${bundle.verdict.blockingFindings}</dd></div>
    <div class="metric"><dt>Changed lines</dt><dd>${bundle.patch.stats.additions + bundle.patch.stats.deletions}</dd></div>
  </dl>`;
}

function hero(bundle: ProofBundle): string {
  const verdict = bundle.verdict.status;
  return `<header class="hero verdict-${escapeHtml(verdict)}" id="overview">
    <div class="hero-row">
      <div class="verdict-lockup">
        <div class="verdict-symbol">${verdictIcon(verdict)}</div>
        <div>
          <h1>${escapeHtml(bundle.contract.value.title)}: ${escapeHtml(verdict)}</h1>
          <p class="hero-summary">${escapeHtml(bundle.verdict.summary)}</p>
          <div class="ref-line">
            <span>${escapeHtml(short(bundle.patch.baseCommit))}</span>
            <span class="ref-arrow" aria-label="to">→</span>
            <span>${escapeHtml(short(bundle.patch.headCommit))}</span>
            <span>·</span>
            <span>${escapeHtml(bundle.patch.repositoryName)}</span>
            <span>·</span>
            <span>${escapeHtml(new Date(bundle.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }))}</span>
          </div>
        </div>
      </div>
      <div class="hero-actions">
        <button class="button" type="button" onclick="window.print()">Print report</button>
        <button class="button button-primary" type="button" data-copy="${escapeHtml(bundle.chainDigest)}">${icon("copy")} Copy chain digest</button>
      </div>
    </div>
    ${metrics(bundle)}
  </header>`;
}

function graph(bundle: ProofBundle): string {
  const claims = bundle.claims.slice(0, 4);
  const shownEvidence = bundle.evidence.slice(0, 5);
  const claimY = (index: number): number => 48 + index * 68;
  const evidenceY = (index: number): number => 42 + index * 54;
  const height = Math.max(310, claims.length * 68 + 45, shownEvidence.length * 54 + 35);
  const edges = claims
    .flatMap((claim, claimIndex) =>
      claim.evidenceIds
        .map((id) => shownEvidence.findIndex((record) => record.id === id))
        .filter((index) => index >= 0)
        .map((evidenceIndex) => {
          const passed = claim.status === "proven" ? " graph-edge-passed" : "";
          return `<path class="graph-edge${passed}" d="M 326 ${claimY(claimIndex)} C 390 ${claimY(claimIndex)}, 410 ${evidenceY(evidenceIndex)}, 474 ${evidenceY(evidenceIndex)}"/>`;
        }),
    )
    .join("");
  const verdictEdges = claims
    .map(
      (claim, index) =>
        `<path class="graph-edge${claim.status === "proven" ? " graph-edge-passed" : ""}" d="M 112 ${height / 2} C 126 ${height / 2}, 128 ${claimY(index)}, 142 ${claimY(index)}"/>`,
    )
    .join("");
  const claimNodes = claims
    .map(
      (claim, index) => `<g tabindex="0" aria-label="Claim ${escapeHtml(claim.id)}: ${escapeHtml(claim.status)}">
        <rect class="graph-node graph-node-${escapeHtml(claim.status)}" x="142" y="${claimY(index) - 22}" width="184" height="44" rx="8"/>
        <text class="graph-label" x="155" y="${claimY(index) - 2}">${escapeHtml(claim.statement.slice(0, 25))}${claim.statement.length > 25 ? "…" : ""}</text>
        <text class="graph-sub" x="155" y="${claimY(index) + 13}">${escapeHtml(claim.status)} · ${escapeHtml(claim.id.slice(0, 18))}</text>
      </g>`,
    )
    .join("");
  const evidenceNodes = shownEvidence
    .map(
      (record, index) => `<g tabindex="0" aria-label="Evidence ${escapeHtml(record.id)}: ${escapeHtml(record.status)}">
        <rect class="graph-node graph-node-${escapeHtml(record.status)}" x="474" y="${evidenceY(index) - 18}" width="162" height="36" rx="7"/>
        <text class="graph-label" x="486" y="${evidenceY(index) - 1}">${escapeHtml(record.producer.slice(0, 22))}</text>
        <text class="graph-sub" x="486" y="${evidenceY(index) + 12}">${escapeHtml(record.status)}</text>
      </g>`,
    )
    .join("");
  const semantic = bundle.claims
    .map((claim) => `<li><strong>${escapeHtml(claim.statement)}</strong><span>${escapeHtml(claim.status)}. ${claim.evidenceIds.length} linked evidence record${claim.evidenceIds.length === 1 ? "" : "s"}.</span></li>`)
    .join("");

  return `<section class="section" aria-labelledby="graph-title">
    <div class="section-head"><div><h2 id="graph-title">Proof graph</h2><p class="section-intro">The verdict is connected to claims, then to the evidence records that support or challenge them.</p></div></div>
    <div class="graph-layout">
      <div class="graph-canvas">
        <svg viewBox="0 0 670 ${height}" role="img" aria-labelledby="proof-graph-label proof-graph-description">
          <title id="proof-graph-label">Patch proof relationship graph</title>
          <desc id="proof-graph-description">Verdict ${escapeHtml(bundle.verdict.status)}, connected to ${bundle.claims.length} claims and ${bundle.evidence.length} evidence records.</desc>
          ${verdictEdges}
          ${edges}
          <g tabindex="0" aria-label="Verdict: ${escapeHtml(bundle.verdict.status)}">
            <rect class="graph-node graph-node-${escapeHtml(bundle.verdict.status === "verified" ? "passed" : bundle.verdict.status === "rejected" || bundle.verdict.status === "error" ? "failed" : "unproven")}" x="10" y="${height / 2 - 27}" width="102" height="54" rx="10"/>
            <text class="graph-label" x="25" y="${height / 2 - 4}">Verdict</text>
            <text class="graph-sub" x="25" y="${height / 2 + 13}">${escapeHtml(bundle.verdict.status)}</text>
          </g>
          ${claimNodes}
          ${evidenceNodes}
        </svg>
      </div>
      <ol class="semantic-graph" aria-label="Proof graph as a list">${semantic}</ol>
    </div>
  </section>`;
}

function claimRow(claim: EvaluatedClaim): string {
  const links = claim.evidenceIds
    .map((id) => `<a class="evidence-link" href="#evidence-${escapeHtml(id)}">${icon("link")} ${escapeHtml(short(id, 18))}</a>`)
    .join("");
  return `<article class="claim" data-filter-kind="claim" data-status="${escapeHtml(claim.status)}">
    <div class="claim-mark">${claimIcon(claim.status)}</div>
    <div>
      <span class="claim-id">${escapeHtml(claim.id)}</span>
      <h3>${escapeHtml(claim.statement)}</h3>
      <p>${escapeHtml(claim.explanation)}</p>
      ${links ? `<div class="evidence-links">${links}</div>` : ""}
    </div>
    ${status(claim.status)}
  </article>`;
}

function claimsSection(bundle: ProofBundle): string {
  return `<section class="section" id="claims" aria-labelledby="claims-title">
    <div class="section-head">
      <div><h2 id="claims-title">Claims</h2><p class="section-intro">Each claim is evaluated only against the evidence requirements declared in the task contract.</p></div>
      <div class="toolbar">
        <label><span class="sr-only">Filter claims</span><select class="filter" data-filter="claim"><option value="all">All claim states</option><option value="proven">Proven</option><option value="disproven">Disproven</option><option value="unproven">Unproven</option></select></label>
        <span class="result-count" data-count-for="claim">${bundle.claims.length} shown</span>
      </div>
    </div>
    <div class="claim-list">${bundle.claims.map(claimRow).join("") || '<p class="empty">The contract contains no claims.</p>'}</div>
  </section>`;
}

function findingRow(finding: Finding): string {
  const location = finding.location
    ? `${finding.location.path}${finding.location.line ? `:${finding.location.line}` : ""}`
    : finding.relatedFiles.join(", ") || "Repository";
  return `<tr data-filter-kind="finding" data-status="${escapeHtml(finding.severity)}">
    <td data-label="Severity"><span class="status severity-${escapeHtml(finding.severity)}">${severityIcon(finding.severity)} ${escapeHtml(finding.severity)}</span></td>
    <td data-label="Finding"><div class="finding-title">${escapeHtml(finding.title)}</div><div class="finding-description">${escapeHtml(finding.description)}</div></td>
    <td data-label="Location" class="mono">${escapeHtml(location)}</td>
    <td data-label="Rule" class="mono">${escapeHtml(finding.ruleId)}</td>
  </tr>`;
}

function findingsSection(bundle: ProofBundle): string {
  const body = bundle.findings.length
    ? `<table class="data-table"><thead><tr><th style="width:130px">Severity</th><th>Finding</th><th style="width:25%">Location</th><th style="width:18%">Rule</th></tr></thead><tbody>${bundle.findings.map(findingRow).join("")}</tbody></table>`
    : '<p class="empty">No findings were produced by the enabled rules.</p>';
  return `<section class="section" id="findings" aria-labelledby="findings-title">
    <div class="section-head">
      <div><h2 id="findings-title">Findings</h2><p class="section-intro">Blocking conditions, warnings, and informational observations from deterministic analyzers.</p></div>
      <div class="toolbar"><label><span class="sr-only">Filter findings</span><select class="filter" data-filter="finding"><option value="all">All severities</option><option value="blocking">Blocking</option><option value="warning">Warning</option><option value="info">Info</option></select></label><span class="result-count" data-count-for="finding">${bundle.findings.length} shown</span></div>
    </div>${body}
  </section>`;
}

function evidenceItem(record: EvidenceRecord): string {
  const output = [
    record.command ? `$ ${record.command}` : "",
    record.stdout ? `\n${record.stdout}` : "",
    record.stderr ? `\n[stderr]\n${record.stderr}` : "",
    record.details ? `\n${record.details}` : "",
  ]
    .filter(Boolean)
    .join("")
    .trim();
  return `<details class="evidence-item" id="evidence-${escapeHtml(record.id)}" data-filter-kind="evidence" data-status="${escapeHtml(record.status)}">
    <summary>
      <span class="claim-mark">${evidenceIcon(record.status)}</span>
      <span class="evidence-summary"><strong>${escapeHtml(record.summary)}</strong><span>${escapeHtml(record.producer)} · ${escapeHtml(formatDuration(record.durationMs))}</span></span>
      ${status(record.status)}
    </summary>
    <div class="evidence-body">
      <dl class="metadata"><div><dt>Evidence ID</dt><dd>${escapeHtml(record.id)}</dd></div><div><dt>Digest</dt><dd>${escapeHtml(short(record.digest, 20))}</dd></div><div><dt>Exit code</dt><dd>${escapeHtml(record.exitCode ?? "n/a")}</dd></div></dl>
      ${output ? `<pre><code>${escapeHtml(output)}</code></pre>` : '<p class="empty">This evidence record has no raw output.</p>'}
    </div>
  </details>`;
}

function evidenceSection(bundle: ProofBundle): string {
  return `<section class="section" id="evidence" aria-labelledby="evidence-title">
    <div class="section-head">
      <div><h2 id="evidence-title">Evidence</h2><p class="section-intro">Commands and rules are recorded in execution order. Each digest commits to the previous record.</p></div>
      <div class="toolbar">
        <label><span class="sr-only">Filter evidence</span><select class="filter" data-filter="evidence"><option value="all">All evidence states</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="skipped">Skipped</option><option value="error">Error</option></select></label>
        <button class="button" type="button" data-expand-evidence>Expand all</button><button class="button" type="button" data-collapse-evidence>Collapse all</button>
        <span class="result-count" data-count-for="evidence">${bundle.evidence.length} shown</span>
      </div>
    </div>
    <div class="evidence-list">${bundle.evidence.map(evidenceItem).join("") || '<p class="empty">No evidence records were created.</p>'}</div>
  </section>`;
}

function filesSection(bundle: ProofBundle): string {
  const rows = bundle.patch.files
    .map((file) => `<tr><td data-label="File" class="mono">${escapeHtml(file.path)}</td><td data-label="Change">${escapeHtml(file.kind)}</td><td data-label="Added" class="mono">+${file.additions}</td><td data-label="Deleted" class="mono">−${file.deletions}</td><td data-label="Binary">${file.binary ? "Yes" : "No"}</td></tr>`)
    .join("");
  return `<section class="section" id="files" aria-labelledby="files-title">
    <div class="section-head"><div><h2 id="files-title">Changed files</h2><p class="section-intro">The exact patch surface used by scope and integrity rules.</p></div></div>
    ${rows ? `<table class="data-table"><thead><tr><th>File</th><th style="width:110px">Change</th><th style="width:90px">Added</th><th style="width:90px">Deleted</th><th style="width:90px">Binary</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">The compared refs contain no file changes.</p>'}
  </section>`;
}

function digestRow(label: string, value: string): string {
  return `<div class="digest-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>${copyButton(value)}</div>`;
}

function integritySection(bundle: ProofBundle): string {
  const signed = bundle.attestation;
  return `<section class="section" id="integrity" aria-labelledby="integrity-title">
    <div class="section-head"><div><h2 id="integrity-title">Integrity</h2><p class="section-intro">Digests make policy, task intent, patch content, and evidence order independently verifiable.</p></div></div>
    <div class="integrity-grid">
      <div class="integrity-status">
        ${signed ? status("verified") : status("incomplete")}
        <strong>${signed ? "Signed proof bundle" : "Unsigned proof bundle"}</strong>
        <p>${signed ? `Ed25519 attestation from key ${escapeHtml(signed.keyId)}.` : "The hash chain is complete, but no signing key was used."}</p>
      </div>
      <dl class="digest-list">
        ${digestRow("Patch diff", bundle.patch.diffDigest)}
        ${digestRow("Policy", bundle.policy.seal.digest)}
        ${digestRow("Contract", bundle.contract.digest)}
        ${digestRow("Evidence chain", bundle.chainDigest)}
${signed ? `        ${digestRow("Signed digest", signed.signedDigest)}\n` : ""}      </dl>
    </div>
  </section>`;
}

export interface ReportOptions {
  title?: string;
}

export function renderProofReport(bundle: ProofBundle, options: ReportOptions = {}): string {
  const title = options.title ?? `${bundle.contract.value.title} · PatchProof`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="PatchProof verification report for ${escapeHtml(bundle.patch.repositoryName)}">
  <title>${escapeHtml(title)}</title>
  <style>${REPORT_STYLES}</style>
  <style>.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style>
</head>
<body>
  <a class="skip-link" href="#report-main">Skip to report</a>
  <div class="shell">
    ${nav().trim()}
    <div class="content">
      ${hero(bundle)}
      <main class="main" id="report-main">
        ${graph(bundle)}
        ${claimsSection(bundle)}
        ${findingsSection(bundle)}
        ${evidenceSection(bundle)}
        ${filesSection(bundle)}
        ${integritySection(bundle)}
      </main>
      <footer class="footer">Generated by PatchProof ${escapeHtml(bundle.generator.version)}. The bundled JSON is the source of truth; this HTML is an offline projection.</footer>
    </div>
  </div>
  <script type="application/json" id="patchproof-data">${safeJson(bundle)}</script>
  <script>${REPORT_SCRIPT}</script>
</body>
</html>`;
}
