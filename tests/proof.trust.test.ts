import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDemoBundle } from "../src/report/demo.js";
import { bundleDigest, generateSigningKeyPair, parseProofBundle, signProofBundle, verifyProofBundle } from "../src/proof/index.js";
import { rebuildProof, passingProof } from "./helpers/proof.js";

describe("untrusted proof structure", () => {
  it.each([null, undefined, true, 123, "proof", [], {}, { schemaVersion: "1.0" }])("rejects malformed input %j without throwing", (value) => {
    expect(verifyProofBundle(value).valid).toBe(false);
    expect(() => parseProofBundle(value)).toThrow(/Invalid proof structure/u);
  });

  it.each(Object.keys(createDemoBundle()))("requires the top-level %s field", (field) => {
    const input = JSON.parse(JSON.stringify(createDemoBundle())) as Record<string, unknown>;
    delete input[field];
    expect(verifyProofBundle(input).valid).toBe(false);
  });

  it.each([
    ["/evidence/0/metadata", null], ["/evidence/0/relatedFiles", "file"],
    ["/evidence/0/durationMs", -1], ["/evidence/0/startedAt", "yesterday"],
    ["/evidence/0/exitCode", 0.5], ["/findings/0/location/line", 0],
    ["/findings/0/severity", "critical"], ["/claims/0/evidenceIds", [1]],
    ["/patch/stats/additions", "2"], ["/patch/files/0/binary", null],
    ["/policy/value/commands/0/run", 42], ["/contract/value/claims", null],
    ["/generator/name", "other"], ["/verdict/status", "approved"],
    ["/attestation", {}], ["/unexpected", true],
  ])("rejects malformed nested field %s", (path, value) => {
    const input = JSON.parse(JSON.stringify(createDemoBundle()));
    const parts = (path as string).slice(1).split("/");
    let target = input;
    for (const part of parts.slice(0, -1)) target = target[part];
    target[parts.at(-1)!] = value;
    expect(verifyProofBundle(input).valid).toBe(false);
  });

  it("does not coerce, normalize, or add defaults to signed content", () => {
    const bundle = createDemoBundle();
    const bytes = JSON.stringify(bundle);
    expect(parseProofBundle(bundle)).toBe(bundle);
    expect(JSON.stringify(bundle)).toBe(bytes);
  });

  it("returns an invalid result for circular metadata from API callers", () => {
    const bundle = createDemoBundle();
    bundle.evidence[0]!.metadata["cycle"] = bundle;
    expect(verifyProofBundle(bundle).valid).toBe(false);
  });
});

describe("consumer trust requirements", () => {
  it("accepts a pinned signer, commits, contract, and passing verdict", () => {
    const keys = generateSigningKeyPair();
    const bundle = signProofBundle(passingProof(), keys.privateKey);
    expect(verifyProofBundle(bundle, {
      trustedPublicKeys: [generateSigningKeyPair().publicKey, keys.publicKey.replace(/\n/gu, "\r\n")],
      expectedHead: bundle.patch.headCommit.toUpperCase(), expectedBase: bundle.patch.baseCommit,
      expectedContractDigest: bundle.contract.digest, requireBasePolicy: true, requireVerified: true,
    })).toEqual({ valid: true, errors: [], signature: "valid" });
  });

  it("rejects unsigned, unknown, and empty trusted-key lists", () => {
    const keys = generateSigningKeyPair();
    const bundle = signProofBundle(createDemoBundle(), keys.privateKey);
    expect(verifyProofBundle(createDemoBundle(), { requireSignature: true }).valid).toBe(false);
    expect(verifyProofBundle(createDemoBundle(), { trustedPublicKeys: [keys.publicKey] }).valid).toBe(false);
    expect(verifyProofBundle(bundle, { trustedPublicKeys: [] }).valid).toBe(false);
    const result = verifyProofBundle(bundle, { trustedPublicKeys: [generateSigningKeyPair().publicKey] });
    expect(result).toMatchObject({ valid: false, signature: "valid" });
    expect(result.errors.join(" ")).toContain("trusted key list");
  });

  it.each([
    { expectedHead: "a".repeat(40) }, { expectedHead: "HEAD" }, { expectedBase: "main" },
    { expectedContractDigest: "f".repeat(64) }, { requireVerified: true },
  ])("rejects unmet consumer requirement %j", (options) => {
    expect(verifyProofBundle(createDemoBundle(), options).valid).toBe(false);
  });

  it("rejects malformed keys and non-Ed25519 signing keys", () => {
    const keys = generateSigningKeyPair();
    const bundle = signProofBundle(createDemoBundle(), keys.privateKey);
    expect(verifyProofBundle(bundle, { trustedPublicKeys: ["invalid"] }).valid).toBe(false);
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    expect(() => signProofBundle(createDemoBundle(), ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString())).toThrow(/Ed25519/u);
    expect(verifyProofBundle(bundle, { trustedPublicKeys: [ec.publicKey.export({ type: "spki", format: "pem" }).toString()] }).valid).toBe(false);
  });

  it("rejects weaker policy provenance and a false base seal even after rehashing", () => {
    const bundle = createDemoBundle();
    bundle.policy.seal.source = "explicit-file";
    bundle.contentDigest = bundleDigest(bundle);
    expect(verifyProofBundle(bundle).valid).toBe(true);
    expect(verifyProofBundle(bundle, { requireBasePolicy: true }).valid).toBe(false);
    bundle.policy.seal.source = "base-commit";
    bundle.policy.seal.sourceRef = "a".repeat(40);
    bundle.contentDigest = bundleDigest(bundle);
    expect(verifyProofBundle(bundle).errors.join(" ")).toContain("sealed policy ref");
  });

  it.each(["exit", "timeout", "identity", "required", "duplicate", "unknown", "skipped"])("rejects inconsistent command evidence: %s", (kind) => {
    const bundle = createDemoBundle();
    const record = bundle.evidence.find((item) => item.type === "command")!;
    if (kind === "exit") record.exitCode = 1;
    if (kind === "timeout") record.metadata["timedOut"] = true;
    if (kind === "identity") record.producer = "command:other";
    if (kind === "required") record.metadata["required"] = false;
    if (kind === "duplicate") bundle.evidence.push({ ...structuredClone(record), id: "duplicate" });
    if (kind === "unknown") record.metadata["commandId"] = "unknown";
    if (kind === "skipped") record.status = "skipped";
    expect(verifyProofBundle(rebuildProof(bundle)).valid).toBe(false);
  });
});
