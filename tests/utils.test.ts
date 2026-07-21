import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  filterByGlobs,
  isTestPath,
  matchesGlob,
  normalizeRepositoryPath,
  redactSecrets,
  sha256,
  sha256Json,
  stableId,
  verifySha256,
} from "../src/utils/index.js";

describe("canonical JSON and hashes", () => {
  it("sorts every object and preserves array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, omitted: undefined, list: [3, undefined, 1] })).toBe(
      '{"a":{"x":3,"y":2},"list":[3,null,1],"z":1}',
    );
    const sparse = new Array<unknown>(2);
    sparse[1] = "present";
    expect(canonicalJson(sparse)).toBe('[null,"present"]');
  });

  it("rejects values that cannot be represented safely", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(/non-finite/u);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow(/circular/u);
  });

  it("produces known and verifiable SHA-256 digests", () => {
    const digest = sha256("abc");
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(verifySha256("abc", digest)).toBe(true);
    expect(verifySha256("changed", digest)).toBe(false);
    expect(sha256Json({ b: 2, a: 1 })).toBe(sha256('{"a":1,"b":2}'));
  });

  it("creates namespaced stable IDs", () => {
    expect(stableId("Finding", "rule", "path")).toBe(stableId("finding", "rule", "path"));
    expect(stableId("finding", "rule", "path")).toMatch(/^finding_[a-f\d]{20}$/u);
    expect(stableId("finding", "rule", "other")).not.toBe(stableId("finding", "rule", "path"));
  });
});

describe("glob helpers", () => {
  it("normalizes Windows paths and matches dotfiles", () => {
    expect(normalizeRepositoryPath(".\\src\\nested\\file.ts")).toBe("src/nested/file.ts");
    expect(matchesGlob("src\\nested\\file.ts", "src/**/*.ts")).toBe(true);
    expect(matchesGlob(".github/workflows/ci.yml", "**/*.yml")).toBe(true);
  });

  it("filters includes and excludes and recognizes test conventions", () => {
    expect(
      filterByGlobs(
        ["src/a.ts", "src/a.test.ts", "docs/guide.md"],
        ["src/**"],
        ["**/*.test.ts"],
      ),
    ).toEqual(["src/a.ts"]);
    expect(isTestPath("packages/core/__tests__/unit.ts")).toBe(true);
    expect(isTestPath("src/service.spec.ts")).toBe(true);
    expect(isTestPath("src/service.ts")).toBe(false);
  });
});

describe("secret redaction", () => {
  it("redacts exact values, credentials, and well-known token shapes", () => {
    const exactSecret = ["correct-horse-", "battery-staple"].join("");
    const githubToken = ["ghp_", "abcdefghijklmnopqrstuvwxyz012345"].join("");
    const credentialedUri = ["https://me:", "hunter2@example.test"].join("");
    const output = redactSecrets(
      `secret=${exactSecret} ${githubToken} ${credentialedUri}`,
      [exactSecret],
    );
    expect(output).not.toContain("correct-horse");
    expect(output).not.toContain("ghp_");
    expect(output).not.toContain("hunter2");
    expect(output.match(/\[REDACTED\]/gu)?.length).toBeGreaterThanOrEqual(3);
  });

  it("does not replace tiny, collision-prone values", () => {
    expect(redactSecrets("status ok", ["ok"])).toBe("status ok");
  });
});
