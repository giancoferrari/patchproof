import type { EvidenceRecord } from "../types.js";
import { canonicalJson, sha256 } from "../utils/hash.js";

type UnsealedEvidence = Omit<EvidenceRecord, "previousDigest" | "digest">;

function evidencePayload(
  record: Omit<EvidenceRecord, "digest">,
): Omit<EvidenceRecord, "digest"> {
  return record;
}

export function sealEvidence(records: UnsealedEvidence[]): EvidenceRecord[] {
  let previousDigest: string | null = null;

  return records.map((record) => {
    const withPrevious: Omit<EvidenceRecord, "digest"> = {
      ...record,
      previousDigest,
    };
    const digest = sha256(canonicalJson(evidencePayload(withPrevious)));
    const sealed: EvidenceRecord = { ...withPrevious, digest };
    previousDigest = digest;
    return sealed;
  });
}

export function verifyEvidenceChain(records: EvidenceRecord[]): {
  valid: boolean;
  errors: string[];
  digest: string;
} {
  const errors: string[] = [];
  let expectedPrevious: string | null = null;

  for (const [index, record] of records.entries()) {
    if (record.previousDigest !== expectedPrevious) {
      errors.push(
        `Evidence ${record.id} at index ${index} points to ${record.previousDigest ?? "null"}; expected ${expectedPrevious ?? "null"}.`,
      );
    }

    const { digest: claimedDigest, ...payload } = record;
    const actualDigest = sha256(canonicalJson(payload));
    if (claimedDigest !== actualDigest) {
      errors.push(`Evidence ${record.id} has an invalid digest.`);
    }
    expectedPrevious = claimedDigest;
  }

  return {
    valid: errors.length === 0,
    errors,
    digest: expectedPrevious ?? sha256("patchproof:empty-evidence-chain"),
  };
}
