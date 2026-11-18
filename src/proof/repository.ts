import { loadSealedPolicy } from "../config/policy.js";
import { parseContractYaml } from "../config/contract.js";
import { DEFAULT_CONTRACT_PATH, DEFAULT_POLICY_PATH } from "../constants.js";
import { GitRepository } from "../git/index.js";
import type { ProofBundle } from "../types.js";
import { canonicalJson, sha256 } from "../utils/index.js";
import { verifyProofBundle, type BundleVerificationOptions, type BundleVerificationResult } from "./bundle.js";

export interface RepositoryVerificationOptions extends BundleVerificationOptions {
  policyPath?: string;
  contractPath?: string;
}

/** Reproduce a bundle's source inputs from local Git objects without checking out either ref. */
export async function verifyProofAgainstRepository(
  bundle: ProofBundle, directory: string, options: RepositoryVerificationOptions = {},
): Promise<BundleVerificationResult> {
  const result = verifyProofBundle(bundle, { ...options, requireBasePolicy: true });
  if (!result.valid) return result;
  const errors: string[] = [];
  const { baseCommit, headCommit } = bundle.patch;
  const policyPath = options.policyPath ?? DEFAULT_POLICY_PATH;
  const contractPath = options.contractPath ?? DEFAULT_CONTRACT_PATH;
  try {
    if (![baseCommit, headCommit].every((id) => /^(?:[a-f\d]{40}|[a-f\d]{64})$/u.test(id))) {
      throw new Error("Repository verification requires full commit object IDs.");
    }
    if (bundle.policy.seal.path !== policyPath) throw new Error("The policy seal path differs from the verifier's policy path.");
    const repository = await GitRepository.discover(directory);
    const resolved = await repository.resolveComparisonRefs(baseCommit, headCommit);
    if (resolved.baseCommit !== baseCommit || resolved.headCommit !== headCommit) throw new Error("The recorded IDs must identify commits directly.");
    const diff = await repository.getDiff(baseCommit, headCommit);
    if (diff !== bundle.patch.diff) errors.push("The committed Git diff differs from the proof.");
    const policy = await loadSealedPolicy(repository, baseCommit, policyPath);
    if (policy.seal.digest !== bundle.policy.seal.digest) errors.push("The policy at the base commit differs from the proof.");
    const rawContract = await repository.getFileAtRef(headCommit, contractPath);
    if (rawContract === null) {
      errors.push("The contract is missing from the candidate commit.");
    } else if (sha256(canonicalJson(parseContractYaml(rawContract, contractPath))) !== bundle.contract.digest) {
      errors.push("The contract at the candidate commit differs from the proof.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { valid: !errors.length, signature: result.signature, errors };
}
