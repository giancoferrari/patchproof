import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createBuiltinAnalyzers } from "../analyzers/index.js";
import { validateContractAgainstPolicy } from "../config/contract.js";
import { contractSchema, policySchema } from "../config/schemas.js";
import { computePatchStats, parseGitDiff } from "../git/diff.js";
import type {
  PatchContract,
  PatchProofPolicy,
  PolicySeal,
  ProofAttestation,
  ProofBundle,
} from "../types.js";
import { PROOF_SCHEMA_VERSION } from "../types.js";
import { canonicalJson, sha256, stableId } from "../utils/hash.js";
import { evaluateClaims } from "./claims.js";
import { verifyEvidenceChain } from "./evidence.js";
import { computeVerdict } from "./verdict.js";
import { parseProofBundle, proofStructureErrors } from "./schema.js";

export interface BundleInput {
  packageVersion: string;
  patch: ProofBundle["patch"];
  policy: PatchProofPolicy;
  policySeal: PolicySeal;
  contract: PatchContract;
  evidence: ProofBundle["evidence"];
  findings: ProofBundle["findings"];
  claims: ProofBundle["claims"];
  verdict: ProofBundle["verdict"];
  createdAt?: string;
}

type ProofBundleContent = Omit<ProofBundle, "contentDigest" | "attestation">;

function proofBundleContent(bundle: ProofBundle): ProofBundleContent {
  const {
    attestation: _attestation,
    contentDigest: _contentDigest,
    ...content
  } = bundle;
  return content;
}

export function bundleDigest(bundle: ProofBundle): string {
  return sha256(canonicalJson(proofBundleContent(bundle)));
}

export function createProofBundle(input: BundleInput): ProofBundle {
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("Cannot create a proof bundle with an invalid timestamp.");
  }
  const chain = verifyEvidenceChain(input.evidence);
  if (!chain.valid) {
    throw new Error(`Cannot create proof bundle from an invalid evidence chain: ${chain.errors.join(" ")}`);
  }

  const content: ProofBundleContent = {
    schemaVersion: PROOF_SCHEMA_VERSION,
    id: stableId("proof", `${input.patch.baseCommit}:${input.patch.headCommit}:${createdAt}`),
    createdAt,
    generator: {
      name: "patchproof",
      version: input.packageVersion,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    },
    patch: input.patch,
    policy: {
      seal: input.policySeal,
      value: input.policy,
    },
    contract: {
      digest: sha256(canonicalJson(input.contract)),
      value: input.contract,
    },
    evidence: input.evidence,
    findings: input.findings,
    claims: input.claims,
    verdict: input.verdict,
    chainDigest: chain.digest,
  };
  return {
    ...content,
    contentDigest: sha256(canonicalJson(content)),
  };
}

export function generateSigningKeyPair(): { privateKey: string; publicKey: string; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    privateKey: privatePem,
    publicKey: publicPem,
    keyId: sha256(publicPem).slice(0, 16),
  };
}

export function signProofBundle(
  bundle: ProofBundle,
  privateKeyPem: string,
  createdAt = new Date().toISOString(),
): ProofBundle {
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("Cannot create an attestation with an invalid timestamp.");
  }
  const verification = verifyProofBundle(bundle);
  if (!verification.valid) {
    throw new Error(`Refusing to sign an invalid proof bundle: ${verification.errors.join(" ")}`);
  }
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("PatchProof signing requires an Ed25519 private key.");
  }
  const publicKeyPem = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" })
    .toString();
  const signedDigest = bundleDigest(bundle);
  const unsignedAttestation: Omit<ProofAttestation, "signature"> = {
    algorithm: "Ed25519",
    publicKey: publicKeyPem,
    signedDigest,
    createdAt,
    keyId: sha256(publicKeyPem).slice(0, 16),
  };
  const signature = cryptoSign(
    null,
    Buffer.from(canonicalJson(unsignedAttestation), "utf8"),
    privateKey,
  ).toString("base64");
  const attestation: ProofAttestation = { ...unsignedAttestation, signature };

  return {
    ...proofBundleContent(bundle),
    contentDigest: signedDigest,
    attestation,
  };
}

export interface BundleVerificationResult {
  valid: boolean;
  errors: string[];
  signature: "valid" | "invalid" | "unsigned";
}

export interface BundleVerificationOptions {
  requireSignature?: boolean;
  /** Public PEM keys obtained independently from the proof producer. Empty means trust nobody. */
  trustedPublicKeys?: readonly string[];
  expectedHead?: string;
  expectedBase?: string;
  expectedContractDigest?: string;
  requireBasePolicy?: boolean;
  requireVerified?: boolean;
}

export function verifyProofBundle(input: unknown, options: BundleVerificationOptions = {}): BundleVerificationResult {
  try {
    return verifyBundleContent(input, options);
  } catch (error) {
    return { valid: false, signature: "invalid", errors: [`Unable to verify proof bundle: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

function verifyBundleContent(input: unknown, options: BundleVerificationOptions): BundleVerificationResult {
  const structureErrors = proofStructureErrors(input);
  if (structureErrors.length > 0) {
    return { valid: false, errors: structureErrors, signature: "invalid" };
  }
  const bundle = input as ProofBundle;
  const errors: string[] = [];
  if (bundle.schemaVersion !== PROOF_SCHEMA_VERSION) {
    errors.push(`Unsupported proof schema ${bundle.schemaVersion}.`);
  }
  if (Number.isNaN(Date.parse(bundle.createdAt))) {
    errors.push("The proof timestamp is invalid.");
  }
  if (sha256(bundle.patch.diff) !== bundle.patch.diffDigest) {
    errors.push("The patch diff digest does not match the bundled diff.");
  }
  const parsedFiles = parseGitDiff(bundle.patch.diff);
  if (canonicalJson(parsedFiles) !== canonicalJson(bundle.patch.files)) {
    errors.push("The bundled file list does not match the patch diff.");
  }
  if (canonicalJson(computePatchStats(parsedFiles)) !== canonicalJson(bundle.patch.stats)) {
    errors.push("The bundled patch statistics do not match the patch diff.");
  }
  const expectedId = stableId(
    "proof",
    `${bundle.patch.baseCommit}:${bundle.patch.headCommit}:${bundle.createdAt}`,
  );
  if (bundle.id !== expectedId) errors.push("The proof ID does not match its commits and timestamp.");

  const parsedPolicy = policySchema.safeParse(bundle.policy.value);
  if (!parsedPolicy.success) errors.push("The bundled policy does not match the policy schema.");
  const parsedContract = contractSchema.safeParse(bundle.contract.value);
  if (!parsedContract.success) errors.push("The bundled contract does not match the contract schema.");
  if (parsedPolicy.success && parsedContract.success) {
    try {
      validateContractAgainstPolicy(parsedContract.data, parsedPolicy.data, "bundled contract");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (sha256(canonicalJson(bundle.policy.value)) !== bundle.policy.seal.digest) {
    errors.push("The policy digest does not match the sealed policy.");
  }
  if (sha256(canonicalJson(bundle.contract.value)) !== bundle.contract.digest) {
    errors.push("The contract digest does not match the bundled contract.");
  }
  if (bundle.policy.seal.source === "base-commit" && bundle.policy.seal.sourceRef !== bundle.patch.baseCommit) {
    errors.push("The sealed policy ref does not match the patch base commit.");
  }

  const chain = verifyEvidenceChain(bundle.evidence);
  errors.push(...chain.errors);
  if (chain.digest !== bundle.chainDigest) {
    errors.push("The evidence chain head does not match chainDigest.");
  }

  if (parsedPolicy.success) {
    const commandIds = new Set<string>();
    for (const record of bundle.evidence.filter((item) => item.type === "command")) {
      const commandId = record.metadata["commandId"];
      const command = parsedPolicy.data.commands.find((item) => item.id === commandId);
      if (!command) {
        errors.push(`Command evidence ${record.id} does not reference a declared policy command.`);
        continue;
      }
      if (commandIds.has(command.id)) errors.push(`Duplicate command evidence for ${command.id}.`);
      commandIds.add(command.id);
      if (record.producer !== `command:${command.id}` || record.metadata["required"] !== command.required) {
        errors.push(`Command evidence ${record.id} does not match its policy command identity or requirement.`);
      }
      if (record.status === "passed" && (record.exitCode !== 0 || record.metadata["timedOut"] === true || record.metadata["aborted"] === true)) {
        errors.push(`Passing command evidence ${record.id} has an inconsistent exit status.`);
      }
      if (record.status === "skipped" && record.exitCode !== null) {
        errors.push(`Skipped command evidence ${record.id} must have a null exit code.`);
      }
    }
    for (const analyzer of createBuiltinAnalyzers(parsedPolicy.data)) {
      const records = bundle.evidence.filter(
        (record) =>
          record.type === "rule" &&
          (record.metadata["analyzerId"] === analyzer.id ||
            record.metadata["ruleId"] === analyzer.id),
      );
      if (records.length !== 1) {
        errors.push(
          `Expected exactly one evidence record for analyzer ${analyzer.id}; found ${records.length}.`,
        );
        continue;
      }
      const record = records[0];
      if (!record) continue;
      const findingIds = record.metadata["findingIds"];
      const findingsDigest = record.metadata["findingsDigest"];
      if (
        !Array.isArray(findingIds) ||
        !findingIds.every((id): id is string => typeof id === "string") ||
        typeof findingsDigest !== "string"
      ) {
        errors.push(`Analyzer ${analyzer.id} evidence lacks its finding manifest.`);
        continue;
      }
      const linkedFindings = findingIds.flatMap((id) => {
        const finding = bundle.findings.find((candidate) => candidate.id === id);
        return finding ? [finding] : [];
      });
      if (linkedFindings.length !== findingIds.length) {
        errors.push(`Analyzer ${analyzer.id} references a missing finding.`);
        continue;
      }
      const normalizedFindings = linkedFindings
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id));
      if (sha256(canonicalJson(normalizedFindings)) !== findingsDigest) {
        errors.push(`Analyzer ${analyzer.id} finding manifest digest is invalid.`);
      }
      const expectedStatus = normalizedFindings.some((finding) => finding.severity !== "info")
        ? "failed"
        : "passed";
      if (record.status !== expectedStatus) {
        errors.push(
          `Analyzer ${analyzer.id} evidence status does not match its findings.`,
        );
      }
    }
  }

  if (parsedPolicy.success && parsedContract.success) {
    const expectedClaims = evaluateClaims(
      parsedContract.data.claims,
      bundle.evidence,
      bundle.findings,
      bundle.patch,
    );
    if (canonicalJson(expectedClaims) !== canonicalJson(bundle.claims)) {
      errors.push("The evaluated claims do not match the bundled evidence and findings.");
    }
    const expectedVerdict = computeVerdict(
      parsedPolicy.data,
      expectedClaims,
      bundle.evidence,
      bundle.findings,
    );
    if (canonicalJson(expectedVerdict) !== canonicalJson(bundle.verdict)) {
      errors.push("The verdict does not match the bundled claims, evidence, and findings.");
    }
  }

  const duplicateCollections: Array<[string, string[]]> = [
    ["evidence", bundle.evidence.map((record) => record.id)],
    ["findings", bundle.findings.map((finding) => finding.id)],
    ["claims", bundle.claims.map((claim) => claim.id)],
  ];
  for (const [label, ids] of duplicateCollections) {
    if (new Set(ids).size !== ids.length) errors.push(`The bundle contains duplicate ${label} IDs.`);
  }

  const expectedContentDigest = bundleDigest(bundle);
  if (bundle.contentDigest !== expectedContentDigest) {
    errors.push("The proof content digest does not match the complete bundle content.");
  }

  let signature: BundleVerificationResult["signature"] = "unsigned";
  if (bundle.attestation) {
    const expectedDigest = expectedContentDigest;
    if (expectedDigest !== bundle.attestation.signedDigest) {
      signature = "invalid";
      errors.push("The signed digest does not match the proof bundle.");
    } else {
      try {
        if (bundle.attestation.algorithm !== "Ed25519") {
          throw new Error(`Unsupported signature algorithm ${String(bundle.attestation.algorithm)}.`);
        }
        if (Number.isNaN(Date.parse(bundle.attestation.createdAt))) {
          throw new Error("The attestation timestamp is invalid.");
        }
        const expectedKeyId = sha256(bundle.attestation.publicKey).slice(0, 16);
        if (bundle.attestation.keyId !== expectedKeyId) {
          throw new Error("The attestation key ID does not match its public key.");
        }
        const {
          signature: _signature,
          ...unsignedAttestation
        } = bundle.attestation;
        const publicKey = createPublicKey(bundle.attestation.publicKey);
        if (publicKey.asymmetricKeyType !== "ed25519") {
          throw new Error("The attestation requires an Ed25519 public key.");
        }
        const valid = cryptoVerify(
          null,
          Buffer.from(canonicalJson(unsignedAttestation), "utf8"),
          publicKey,
          Buffer.from(bundle.attestation.signature, "base64"),
        );
        signature = valid ? "valid" : "invalid";
        if (!valid) errors.push("The Ed25519 signature is invalid.");
      } catch (error) {
        signature = "invalid";
        errors.push(`The attestation could not be verified: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if ((options.requireSignature || options.trustedPublicKeys !== undefined) && signature === "unsigned") {
    errors.push("A signed proof is required by the verifier.");
  }
  if (options.trustedPublicKeys !== undefined && signature === "valid" && bundle.attestation) {
    try {
      const embedded = createPublicKey(bundle.attestation.publicKey).export({ type: "spki", format: "der" });
      const trusted = options.trustedPublicKeys.map((pem) => {
        const key = createPublicKey(pem);
        if (key.asymmetricKeyType !== "ed25519") throw new Error("Trusted keys must be Ed25519 public keys.");
        return key.export({ type: "spki", format: "der" });
      });
      if (!trusted.some((key) => key.equals(embedded))) {
        errors.push("The signing key is not in the verifier's trusted key list.");
      }
    } catch (error) {
      errors.push(`Unable to check trusted keys: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const [name, expected, actual, pattern] of [
    ["head commit", options.expectedHead, bundle.patch.headCommit, /^(?:[a-f\d]{40}|[a-f\d]{64})$/iu],
    ["base commit", options.expectedBase, bundle.patch.baseCommit, /^(?:[a-f\d]{40}|[a-f\d]{64})$/iu],
    ["contract digest", options.expectedContractDigest, bundle.contract.digest, /^[a-f\d]{64}$/iu],
  ] as const) {
    if (expected !== undefined && (!pattern.test(expected) || expected.toLowerCase() !== actual.toLowerCase())) {
      errors.push(`The proof ${name} does not match the verifier's expected full digest.`);
    }
  }
  if (options.requireBasePolicy && bundle.policy.seal.source !== "base-commit") {
    errors.push("The verifier requires a policy sealed to the base commit.");
  }
  if (options.requireVerified && bundle.verdict.status !== "verified") {
    errors.push(`The verifier requires a verified verdict; this proof is ${bundle.verdict.status}.`);
  }

  return { valid: errors.length === 0, errors, signature };
}

export async function writeProofBundle(path: string, bundle: ProofBundle): Promise<void> {
  await writeFile(path, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
}

export async function readProofBundle(path: string): Promise<ProofBundle> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read proof bundle '${path}': ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return parseProofBundle(value);
}
