import type { Finding, ProofBundle, Severity } from "../types.js";

function sarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "blocking") return "error";
  if (severity === "warning") return "warning";
  return "note";
}

const severityRank: Record<Severity, number> = {
  blocking: 0,
  warning: 1,
  info: 2,
};

function resultForFinding(finding: Finding): Record<string, unknown> {
  const result: Record<string, unknown> = {
    ruleId: finding.ruleId,
    level: sarifLevel(finding.severity),
    message: { text: `${finding.title}: ${finding.description}` },
    partialFingerprints: { patchProofFingerprint: finding.fingerprint },
    properties: {
      findingId: finding.id,
      relatedFiles: finding.relatedFiles,
      remediation: finding.remediation ?? null,
    },
  };

  if (finding.location) {
    result["locations"] = [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.location.path.replaceAll("\\", "/") },
          region: {
            startLine: finding.location.line ?? 1,
            startColumn: finding.location.column ?? 1,
          },
        },
      },
    ];
  }
  return result;
}

export function proofBundleToSarif(bundle: ProofBundle): Record<string, unknown> {
  const rules = [...new Map(bundle.findings.map((finding) => [finding.ruleId, finding])).values()]
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
    .map((finding) => ({
      id: finding.ruleId,
      name: finding.ruleId.replaceAll(/[^a-zA-Z0-9]+/g, " ").trim(),
      shortDescription: { text: finding.title },
      help: { text: finding.remediation ?? finding.description },
      defaultConfiguration: { level: sarifLevel(finding.severity) },
    }));

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "PatchProof",
            informationUri: "https://github.com/giancoferrari/patchproof",
            semanticVersion: bundle.generator.version,
            rules,
          },
        },
        invocations: [
          {
            executionSuccessful: bundle.verdict.status !== "error",
            properties: {
              proofId: bundle.id,
              proofVerdict: bundle.verdict.status,
              chainDigest: bundle.chainDigest,
            },
          },
        ],
        results: bundle.findings
          .slice()
          .sort(
            (a, b) =>
              severityRank[a.severity] - severityRank[b.severity] ||
              a.id.localeCompare(b.id),
          )
          .map(resultForFinding),
      },
    ],
  };
}
