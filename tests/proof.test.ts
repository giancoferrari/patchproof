import { describe, expect, it } from "vitest";
import { createDemoBundle } from "../src/report/demo.js";
import {
  bundleDigest,
  generateSigningKeyPair,
  proofBundleToSarif,
  sealEvidence,
  signProofBundle,
  verifyEvidenceChain,
  verifyProofBundle,
} from "../src/proof/index.js";

describe("evidence chain", () => {
  it("links evidence in order and detects tampering", () => {
    const records = sealEvidence([
      {
        id: "one",
        type: "rule",
        producer: "scope",
        status: "passed",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.001Z",
        durationMs: 1,
        summary: "Scope passed",
        relatedFiles: [],
        metadata: { ruleId: "scope" },
      },
      {
        id: "two",
        type: "command",
        producer: "command:tests",
        status: "passed",
        startedAt: "2026-01-01T00:00:00.002Z",
        completedAt: "2026-01-01T00:00:00.003Z",
        durationMs: 1,
        summary: "Tests passed",
        relatedFiles: [],
        metadata: { commandId: "tests" },
      },
    ]);
    expect(records[1]?.previousDigest).toBe(records[0]?.digest);
    expect(verifyEvidenceChain(records).valid).toBe(true);

    const tampered = structuredClone(records);
    if (tampered[0]) tampered[0].summary = "Scope did not actually pass";
    expect(verifyEvidenceChain(tampered).valid).toBe(false);
  });
});

describe("proof bundles", () => {
  it("verifies all digests in the demo proof", () => {
    const bundle = createDemoBundle();
    const result = verifyProofBundle(bundle);
    expect(result).toEqual({ valid: true, errors: [], signature: "unsigned" });
    expect(bundle.verdict.status).toBe("rejected");
  });

  it("signs with Ed25519 and rejects post-signature changes", () => {
    const bundle = createDemoBundle();
    const keys = generateSigningKeyPair();
    const signed = signProofBundle(bundle, keys.privateKey, "2026-01-01T00:00:00.000Z");
    expect(signed.attestation?.keyId).toBe(keys.keyId);
    expect(verifyProofBundle(signed)).toEqual({ valid: true, errors: [], signature: "valid" });
    expect(bundleDigest(signed)).toBe(signed.attestation?.signedDigest);

    const tampered = structuredClone(signed);
    tampered.verdict.summary = "Changed after signing";
    const result = verifyProofBundle(tampered);
    expect(result.valid).toBe(false);
    expect(result.signature).toBe("invalid");
  });

  it("rejects tampered derived verdicts, finding manifests, and content digests", () => {
    const verdictTampered = structuredClone(createDemoBundle());
    verdictTampered.verdict.status = "verified";
    verdictTampered.contentDigest = bundleDigest(verdictTampered);
    const verdictResult = verifyProofBundle(verdictTampered);
    expect(verdictResult.valid).toBe(false);
    expect(verdictResult.errors.join(" ")).toMatch(/verdict does not match/iu);

    const findingsTampered = structuredClone(createDemoBundle());
    findingsTampered.findings = findingsTampered.findings.slice(1);
    findingsTampered.contentDigest = bundleDigest(findingsTampered);
    const findingsResult = verifyProofBundle(findingsTampered);
    expect(findingsResult.valid).toBe(false);
    expect(findingsResult.errors.join(" ")).toMatch(/missing finding|finding manifest/iu);

    const digestTampered = structuredClone(createDemoBundle());
    digestTampered.contentDigest = "0".repeat(64);
    const digestResult = verifyProofBundle(digestTampered);
    expect(digestResult.valid).toBe(false);
    expect(digestResult.errors.join(" ")).toMatch(/content digest/iu);
  });

  it("rejects attestation key ID and creation-time tampering", () => {
    const keys = generateSigningKeyPair();
    const signed = signProofBundle(
      createDemoBundle(),
      keys.privateKey,
      "2026-01-01T00:00:00.000Z",
    );

    const keyIdTampered = structuredClone(signed);
    if (!keyIdTampered.attestation) throw new Error("Expected a signed bundle");
    keyIdTampered.attestation.keyId = "0".repeat(16);
    const keyIdResult = verifyProofBundle(keyIdTampered);
    expect(keyIdResult.valid).toBe(false);
    expect(keyIdResult.signature).toBe("invalid");
    expect(keyIdResult.errors.join(" ")).toMatch(/key ID/iu);

    const createdAtTampered = structuredClone(signed);
    if (!createdAtTampered.attestation) throw new Error("Expected a signed bundle");
    createdAtTampered.attestation.createdAt = "2026-01-02T00:00:00.000Z";
    const createdAtResult = verifyProofBundle(createdAtTampered);
    expect(createdAtResult.valid).toBe(false);
    expect(createdAtResult.signature).toBe("invalid");
    expect(createdAtResult.errors.join(" ")).toMatch(/signature is invalid/iu);
  });

  it("refuses to sign a bundle that fails semantic verification", () => {
    const invalid = structuredClone(createDemoBundle());
    invalid.verdict.status = "verified";
    invalid.contentDigest = bundleDigest(invalid);
    const keys = generateSigningKeyPair();

    expect(() => signProofBundle(invalid, keys.privateKey)).toThrow(
      /Refusing to sign an invalid proof bundle/iu,
    );
  });

  it("rejects invalid proof and attestation timestamps", () => {
    const bundle = createDemoBundle();
    const keys = generateSigningKeyPair();

    expect(() => signProofBundle(bundle, keys.privateKey, "not-a-date")).toThrow(
      /invalid timestamp/iu,
    );

    const tampered = { ...bundle, createdAt: "not-a-date" };
    const result = verifyProofBundle(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("The proof timestamp is invalid.");
  });

  it("produces SARIF with stable findings and physical locations", () => {
    const sarif = proofBundleToSarif(createDemoBundle()) as {
      version: string;
      runs: Array<{ results: Array<{ level: string; locations?: unknown[] }> }>;
    };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.results).toHaveLength(2);
    expect(sarif.runs[0]?.results[0]?.level).toBe("error");
    expect(sarif.runs[0]?.results[0]?.locations).toHaveLength(1);
  });
});
