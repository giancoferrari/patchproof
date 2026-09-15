import type { ProofBundle } from "../../src/types.js";
import { computePatchStats, parseGitDiff } from "../../src/git/diff.js";
import { canonicalJson, sha256 } from "../../src/utils/index.js";
import { createProofBundle, evaluateClaims, computeVerdict, sealEvidence } from "../../src/proof/index.js";
import { createDemoBundle } from "../../src/report/demo.js";

/** Recompute dependent evidence after controlled fixture edits. Does not sign. */
export function rebuildProof(bundle: ProofBundle): ProofBundle {
  bundle.patch.diffDigest = sha256(bundle.patch.diff);
  bundle.patch.files = parseGitDiff(bundle.patch.diff);
  bundle.patch.stats = computePatchStats(bundle.patch.files);
  const drafts = bundle.evidence.map(({ previousDigest: _previous, digest: _digest, ...record }) => {
    if (record.type === "rule") {
      const findings = bundle.findings.filter((finding) => finding.ruleId === record.metadata["ruleId"])
        .sort((a, b) => a.id.localeCompare(b.id));
      record.metadata["findingIds"] = findings.map((finding) => finding.id);
      record.metadata["findingsDigest"] = sha256(canonicalJson(findings));
      record.status = findings.some((finding) => finding.severity !== "info") ? "failed" : "passed";
    }
    return record;
  });
  const evidence = sealEvidence(drafts);
  const claims = evaluateClaims(bundle.contract.value.claims, evidence, bundle.findings, bundle.patch);
  return createProofBundle({
    packageVersion: bundle.generator.version, patch: bundle.patch,
    policy: bundle.policy.value,
    policySeal: { ...bundle.policy.seal, digest: sha256(canonicalJson(bundle.policy.value)) },
    contract: bundle.contract.value, findings: bundle.findings, evidence, claims,
    verdict: computeVerdict(bundle.policy.value, claims, evidence, bundle.findings),
    createdAt: bundle.createdAt,
  });
}

export function passingProof(): ProofBundle {
  const bundle = createDemoBundle();
  bundle.patch.diff = bundle.patch.diff.replace("it.skip", "it");
  bundle.findings = [];
  return rebuildProof(bundle);
}
