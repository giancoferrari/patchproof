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
import { parseUnifiedPatch } from "../analyzers/utils.js";

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

function nav(bundle: ProofBundle): string {
  const entries = [
    ["overview", "Overview", ""], ["findings", "Findings", bundle.findings.length],
    ["files", "Changed files", bundle.patch.files.length], ["claims", "Claims", bundle.claims.length],
    ["evidence", "Evidence", bundle.evidence.length], ["integrity", "Integrity", ""],
  ] as const;
  return `<aside class="rail" aria-label="Report navigation">
    <div class="brand"><span class="brand-mark">${icon("shield")}</span><span>PatchProof</span></div>
    <nav>${entries.map(([id, label, count]) => `<a href="#${id}"${id === "overview" ? ' aria-current="true"' : ""}>${label}${count !== "" ? ` <span class="nav-count">${count}</span>` : ""}</a>`).join("")}</nav>
    <div class="rail-meta">Proof bundle<code>Schema ${escapeHtml(bundle.schemaVersion)}</code></div>
  </aside>`;
}

function hero(bundle: ProofBundle): string {
  const { verdict, patch } = bundle;
  const date = new Date(bundle.createdAt).toISOString().slice(0, 16).replace("T", " ");
  return `<header class="hero" id="overview">
    <div class="report-context"><span>${icon("file")} ${escapeHtml(patch.repositoryName)}</span><time datetime="${escapeHtml(bundle.createdAt)}">${date} UTC</time></div>
    <div class="hero-row"><div class="intro">${status(verdict.status)}
      <h1>${escapeHtml(bundle.contract.value.title)}</h1>
      <p class="hero-summary">${escapeHtml(verdict.summary)}</p>
      <div class="ref-line"><code>${escapeHtml(short(patch.baseCommit, 8))}</code><span aria-label="to">→</span><code>${escapeHtml(short(patch.headCommit, 8))}</code></div>
    </div><div class="hero-actions"><button class="button" type="button" onclick="window.print()">Print report</button></div></div>
    <dl class="metrics">
      <div class="metric"><dt>Blocking findings</dt><dd>${verdict.blockingFindings}</dd></div>
      <div class="metric"><dt>Claims proven</dt><dd>${verdict.provenClaims}<small> / ${bundle.claims.length}</small></dd></div>
      <div class="metric"><dt>Required checks passed</dt><dd>${verdict.requiredCommandsPassed}<small> / ${verdict.requiredCommandsTotal}</small></dd></div>
      <div class="metric"><dt>Changed lines</dt><dd class="changes"><span>+${patch.stats.additions}</span> <span>−${patch.stats.deletions}</span></dd></div>
    </dl>
  </header>`;
}

function graph(bundle: ProofBundle): string {
  const claims = bundle.claims.slice(0, 4);
  const linked = new Set(claims.flatMap((claim) => claim.evidenceIds));
  const shownEvidence = bundle.evidence.filter((record) => linked.has(record.id)).slice(0, 5);
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

function findingPreview(finding: Finding, patch: string | undefined): string {
  if (finding.severity !== "blocking" || finding.ruleId === "secret-scan" || !finding.location?.line || !patch || patch.length > 150_000) return "";
  const lines = parseUnifiedPatch(patch);
  const index = lines.findIndex((line) => line.newLine === finding.location?.line);
  if (index < 0) return "";
  const sample = lines.slice(Math.max(0, index - 1), index + 2);
  return `<figure class="excerpt"><figcaption>${icon("file")} ${escapeHtml(finding.location.path)}</figcaption><pre>${sample.map((line) => {
    const mark = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " ";
    const snippet = line.content.length > 180 ? line.content.slice(0, 180) + "…" : line.content;
    return `<span class="excerpt-${line.kind}"><i>${line.newLine ?? line.oldLine}</i> ${mark} ${escapeHtml(snippet)}</span>`;
  }).join("")}</pre></figure>`;
}

function findingRow(finding: Finding, files: Map<string, number>, evidence: Map<string, string>, preview: string): string {
  const path = finding.location?.path ?? finding.relatedFiles[0];
  const index = path === undefined ? undefined : files.get(path);
  const line = finding.location?.line;
  const location = path ? escapeHtml(path + (line ? `:${line}` : "")) : "";
  const producer = evidence.get(finding.id);
  return `<article class="finding" data-filter-kind="finding" data-status="${escapeHtml(finding.severity)}">
    <div class="finding-heading"><span class="status severity-${escapeHtml(finding.severity)}">${severityIcon(finding.severity)} ${escapeHtml(finding.severity)}</span><span class="rule-name">${escapeHtml(finding.ruleId)}</span></div>
    <div class="${preview ? "finding-with-patch" : ""}"><div><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.description)}</p>
    ${finding.remediation ? `<p class="fix"><strong>Suggested fix</strong> ${escapeHtml(finding.remediation)}</p>` : ""}
    </div>${preview}</div>
    <div class="finding-links">${index === undefined ? location : `<a href="#file-${index}" data-file-link="${index}"${line ? ` data-line="${line}"` : ""}>${icon("file")} ${location}</a>`}
    ${producer ? `<a href="#evidence-${escapeHtml(producer)}">${icon("link")} Inspect evidence</a>` : ""}</div>
  </article>`;
}

function findingsSection(bundle: ProofBundle): string {
  const files = new Map(bundle.patch.files.map((file, index) => [file.path, index]));
  const evidence = new Map<string, string>();
  for (const record of bundle.evidence) {
    const ids = record.metadata["findingIds"];
    if (record.type === "rule" && Array.isArray(ids)) {
      for (const id of ids) if (typeof id === "string") evidence.set(id, record.id);
    }
  }
  const rank = { blocking: 0, warning: 1, info: 2 };
  const body = bundle.findings.length
    ? bundle.findings.slice().sort((a, b) => rank[a.severity] - rank[b.severity]).map((finding, position) => {
        const fileIndex = finding.location && files.get(finding.location.path);
        const preview = position === 0 && fileIndex !== undefined
          ? findingPreview(finding, bundle.patch.files[fileIndex]?.patch)
          : "";
        return findingRow(finding, files, evidence, preview);
      }).join("")
    : '<p class="empty">The enabled rules produced no findings.</p>';
  return `<section class="section" id="findings" aria-labelledby="findings-title">
    <div class="section-head">
      <div><h2 id="findings-title">Findings</h2></div>
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
  const files = bundle.patch.files.map((file, index) => `<details class="patch-file" id="file-${index}" data-index="${index}">
    <summary>${icon("chevron")}<span class="file-path">${escapeHtml(file.path)}</span><span class="file-kind">${escapeHtml(file.kind)}</span><span class="changes"><span>+${file.additions}</span> <span>−${file.deletions}</span></span></summary>
${file.previousPath && file.previousPath !== file.path ? `    <p>Previous path: <code>${escapeHtml(file.previousPath)}</code></p>` : ""}
    ${file.binary ? '<p class="empty">Binary file. The proof JSON contains the Git patch.</p>' : '<div class="patch-view"></div>'}
  </details>`).join("");
  return `<section class="section" id="files" aria-labelledby="files-title"><div class="section-head">
    <h2 id="files-title">Changed files</h2>
    ${files ? '<label class="path-search">Filter by path <input type="search" data-path-search autocomplete="off"></label>' : ""}
    </div>${files || '<p class="empty">The compared commits contain no file changes.</p>'}
    <p class="empty" hidden data-files-empty role="status">No matching file paths.</p>
    <noscript>Enable JavaScript to inspect unified diffs.</noscript></section>`;
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
        ${icon("shield")}
        <strong>${signed ? "Signed proof bundle" : "Unsigned proof bundle"}</strong>
        <p>${signed ? `Ed25519 key ${escapeHtml(signed.keyId)}. Check signer trust with verify-bundle --trusted-key.` : "Verify the recorded digests with the JSON bundle."}</p>
      </div>
      <dl class="digest-list">
        ${digestRow("Bundle content", bundle.contentDigest)}
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
    ${nav(bundle)}
    <div class="content">
      ${hero(bundle)}
      <main class="main" id="report-main">
        ${findingsSection(bundle)}
        ${filesSection(bundle)}
        ${claimsSection(bundle)}
        ${graph(bundle)}
        ${evidenceSection(bundle)}
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
