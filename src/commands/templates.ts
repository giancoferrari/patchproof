import type { CommandSpec, PatchContract, PatchProofPolicy } from "../types.js";
import { stringify } from "yaml";

export function createPolicy(commands: CommandSpec[]): PatchProofPolicy {
  return {
    version: 1,
    commands,
    scope: {
      allowed: ["src/**", "app/**", "packages/**", "tests/**", "test/**", "docs/**", ".patchproof/contract.yml", "*.json", "*.yml", "*.yaml", "*.md"],
      denied: [".git/**", ".env*", ".patchproof/keys/**", ".github/workflows/**"],
    },
    thresholds: {
      maxChangedFiles: 80,
      maxChangedLines: 2_000,
      requireTestsForSourceChanges: true,
    },
    rules: {
      policyIntegrity: true,
      testIntegrity: true,
      secretScan: true,
      dependencyReview: true,
      scope: true,
      diffSize: true,
    },
    model: { provider: "none" },
    redactions: [],
  };
}

export function createContract(commands: CommandSpec[]): PatchContract {
  const requiredCommands = commands.filter((command) => command.required).map((command) => command.id);
  return {
    version: 1,
    id: "default-change-contract",
    title: "Verify the requested change",
    task: "Confirm that the requested behavior is implemented, existing protections remain active, and the patch stays within repository policy.",
    claims: [
      {
        id: "requested-behavior",
        statement: "The requested behavior is supported by the repository verification commands.",
        severity: "blocking",
        evidence: {
          ...(requiredCommands.length > 0 ? { commands: requiredCommands } : {}),
          requireTestChange: true,
        },
      },
      {
        id: "tests-remain-active",
        statement: "Existing tests were not deleted, disabled, or weakened by the patch.",
        severity: "blocking",
        evidence: { rules: ["test-integrity"] },
      },
      {
        id: "change-stays-in-scope",
        statement: "Every changed file is inside the declared scope and outside protected paths.",
        severity: "blocking",
        evidence: { rules: ["scope", "policy-integrity"] },
      },
      {
        id: "added-content-has-no-secrets",
        statement: "Added lines contain no high-confidence credential patterns.",
        severity: "blocking",
        evidence: { rules: ["secret-scan"] },
      },
    ],
    outOfScope: [".git/**", ".patchproof/keys/**", ".env*"],
  };
}

export function policyYaml(policy: PatchProofPolicy): string {
  return `# PatchProof reads this policy from the trusted base commit by default.\n${stringify(policy, { lineWidth: 100 })}`;
}

export function contractYaml(contract: PatchContract): string {
  return `# Claims are falsifiable requirements. Unmet evidence remains unproven.\n${stringify(contract, { lineWidth: 100 })}`;
}
