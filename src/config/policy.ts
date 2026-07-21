import { readFile } from "node:fs/promises";
import type { PatchProofPolicy, PolicySeal } from "../types.js";
import type { GitRepositoryLike } from "../git/repository.js";
import { canonicalJson } from "../utils/canonical-json.js";
import { sha256 } from "../utils/hash.js";
import { ConfigSourceError, ConfigValidationError, zodIssues } from "./errors.js";
import { PatchProofPolicySchema } from "./schemas.js";
import { parseYamlDocument } from "./yaml.js";

export interface LoadedPolicy {
  value: PatchProofPolicy;
  /** Alias retained for ergonomic programmatic use. */
  policy: PatchProofPolicy;
  raw: string;
  seal?: PolicySeal;
}

export interface SealedPolicy extends LoadedPolicy {
  seal: PolicySeal;
}

export function validatePolicy(value: unknown, source = "policy value"): PatchProofPolicy {
  const result = PatchProofPolicySchema.safeParse(value);
  if (!result.success) {
    throw new ConfigValidationError("policy", source, zodIssues(result.error.issues));
  }
  return result.data as PatchProofPolicy;
}

export function parsePolicyYaml(contents: string, source = "policy YAML"): PatchProofPolicy {
  return validatePolicy(parseYamlDocument(contents, "policy", source), source);
}

export const parsePolicy = parsePolicyYaml;

export async function loadPolicy(path: string): Promise<LoadedPolicy> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new ConfigSourceError("Unable to read PatchProof policy", path, { cause: error });
  }
  const value = parsePolicyYaml(raw, path);
  return { value, policy: value, raw };
}

/**
 * Load policy bytes from a trusted base commit, never from the proposed patch.
 */
export async function loadSealedPolicy(
  repository: GitRepositoryLike,
  baseRef: string,
  path: string,
): Promise<SealedPolicy> {
  const baseCommit = await repository.resolveRef(baseRef);
  const raw = await repository.getFileAtRef(baseCommit, path);
  if (raw === null) {
    throw new ConfigSourceError(
      `PatchProof policy does not exist at trusted ref ${baseCommit}`,
      path,
    );
  }

  const value = parsePolicyYaml(raw, `${baseCommit}:${path}`);
  return {
    value,
    policy: value,
    raw,
    seal: {
      source: "base-commit",
      sourceRef: baseCommit,
      path,
      digest: sha256(canonicalJson(value)),
    },
  };
}

export const loadPolicyFromBase = loadSealedPolicy;
