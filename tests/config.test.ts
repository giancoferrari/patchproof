import { describe, expect, it } from "vitest";
import { canonicalJson, sha256 } from "../src/utils/index.js";
import {
  ConfigValidationError,
  loadSealedPolicy,
  parseContractText,
  parsePolicyText,
  validateContractAgainstPolicy,
} from "../src/config/index.js";
import type { GitRepositoryLike } from "../src/git/index.js";

const policyText = `
version: 1
commands:
  - id: test
    run: npm test
scope:
  denied: ["dist/**"]
thresholds: {}
rules: {}
model:
  provider: none
redactions: []
`;

describe("policy configuration", () => {
  it("loads strict YAML and applies safe defaults", () => {
    const policy = parsePolicyText(policyText, "inline policy");
    expect(policy.commands[0]).toMatchObject({ id: "test", timeoutMs: 300_000, required: true });
    expect(policy.scope.allowed).toEqual(["**/*"]);
    expect(policy.thresholds.requireTestsForSourceChanges).toBe(true);
    expect(policy.rules.secretScan).toBe(true);
  });

  it("reports YAML and schema errors with an actionable source and path", () => {
    expect(() => parsePolicyText("version: [", "broken.yml")).toThrow(/broken\.yml/u);

    try {
      parsePolicyText("version: 1\ncommands: []\nsurprise: true\n", "strict.yml");
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect(String(error)).toMatch(/unrecognized|surprise/iu);
    }
  });

  it("rejects duplicate command IDs", () => {
    expect(() =>
      parsePolicyText(
        "version: 1\ncommands:\n  - { id: test, run: one }\n  - { id: test, run: two }\n",
        "duplicates.yml",
      ),
    ).toThrow(/duplicates commands\[0\]/u);
  });

  it("seals policy loaded from the resolved base commit", async () => {
    const commit = "a".repeat(40);
    const calls: string[] = [];
    const repository: GitRepositoryLike = {
      async resolveRef(ref) {
        calls.push(`resolve:${ref}`);
        return commit;
      },
      async getFileAtRef(ref, path) {
        calls.push(`read:${ref}:${path}`);
        return policyText;
      },
    };

    const loaded = await loadSealedPolicy(repository, "origin/main", ".patchproof/policy.yml");
    expect(calls).toEqual([
      "resolve:origin/main",
      `read:${commit}:.patchproof/policy.yml`,
    ]);
    expect(loaded.seal.source).toBe("base-commit");
    expect(loaded.seal.sourceRef).toBe(commit);
    expect(loaded.seal.digest).toBe(sha256(canonicalJson(loaded.value)));
  });
});

describe("contract configuration", () => {
  it("validates claims and cross-document command references", () => {
    const policy = parsePolicyText(policyText);
    const contract = parseContractText(`
version: 1
id: pagination-fix
title: Pagination remains bounded
claims:
  - id: no-overflow
    statement: Requests beyond the final page return an empty list.
    evidence:
      commands: [test]
outOfScope: []
`);
    expect(() => validateContractAgainstPolicy(contract, policy)).not.toThrow();
    contract.claims[0]?.evidence.commands?.push("missing");
    expect(() => validateContractAgainstPolicy(contract, policy, "contract.yml")).toThrow(
      /unknown policy command 'missing'/u,
    );
  });

  it("uses the public kebab-case analyzer IDs for rule references", () => {
    const policy = parsePolicyText(policyText);
    const contract = parseContractText(`
version: 1
id: integrity
title: Test integrity
claims:
  - id: tests-remain-strong
    statement: Existing tests have not been weakened.
    evidence:
      rules: [test-integrity, secret-scan, dependency-review, diff-size, policy-integrity, scope]
`);
    expect(() => validateContractAgainstPolicy(contract, policy)).not.toThrow();
  });

  it("rejects empty and duplicate claim collections", () => {
    expect(() =>
      parseContractText("version: 1\nid: empty\ntitle: Empty\nclaims: []\n"),
    ).toThrow(/at least one falsifiable claim/u);
    expect(() =>
      parseContractText(`
version: 1
id: duplicate
title: Duplicate
claims:
  - { id: same, statement: First, evidence: {} }
  - { id: same, statement: Second, evidence: {} }
`),
    ).toThrow(/duplicates claims\[0\]/u);
  });
});
