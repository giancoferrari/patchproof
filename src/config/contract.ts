import { readFile } from "node:fs/promises";
import type { PatchContract, PatchProofPolicy } from "../types.js";
import { ConfigSourceError, ConfigValidationError, zodIssues, type ConfigIssue } from "./errors.js";
import { PatchContractSchema } from "./schemas.js";
import { parseYamlDocument } from "./yaml.js";

export interface LoadedContract {
  value: PatchContract;
  contract: PatchContract;
  raw: string;
}

export function validateContract(value: unknown, source = "contract value"): PatchContract {
  const result = PatchContractSchema.safeParse(value);
  if (!result.success) {
    throw new ConfigValidationError("contract", source, zodIssues(result.error.issues));
  }
  return result.data as PatchContract;
}

export function parseContractYaml(contents: string, source = "contract YAML"): PatchContract {
  return validateContract(parseYamlDocument(contents, "contract", source), source);
}

export const parseContract = parseContractYaml;

export async function loadContract(path: string): Promise<LoadedContract> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new ConfigSourceError("Unable to read PatchProof contract", path, { cause: error });
  }
  const value = parseContractYaml(raw, path);
  return { value, contract: value, raw };
}

/** Validate cross-document references after policy and contract are loaded. */
export function validateContractAgainstPolicy(
  contract: PatchContract,
  policy: PatchProofPolicy,
  source = "contract value",
): void {
  const commandIds = new Set(policy.commands.map((command) => command.id));
  const publicRuleIds: Record<keyof PatchProofPolicy["rules"], string> = {
    policyIntegrity: "policy-integrity",
    testIntegrity: "test-integrity",
    secretScan: "secret-scan",
    dependencyReview: "dependency-review",
    scope: "scope",
    diffSize: "diff-size",
  };
  const knownRuleIds = new Set(
    (Object.keys(policy.rules) as Array<keyof PatchProofPolicy["rules"]>)
      .filter((id) => policy.rules[id])
      .map((id) => publicRuleIds[id]),
  );
  const issues: ConfigIssue[] = [];

  contract.claims.forEach((claim, claimIndex) => {
    claim.evidence.commands?.forEach((commandId, commandIndex) => {
      if (!commandIds.has(commandId)) {
        issues.push({
          path: `$.claims[${claimIndex}].evidence.commands[${commandIndex}]`,
          message: `references unknown policy command '${commandId}'`,
          code: "unknown_command",
        });
      }
    });
    claim.evidence.rules?.forEach((ruleId, ruleIndex) => {
      if (!knownRuleIds.has(ruleId)) {
        issues.push({
          path: `$.claims[${claimIndex}].evidence.rules[${ruleIndex}]`,
          message: `references unknown or disabled policy rule '${ruleId}'`,
          code: "unknown_rule",
        });
      }
    });
  });

  if (issues.length > 0) {
    throw new ConfigValidationError("contract", source, issues);
  }
}
