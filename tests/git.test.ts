import { describe, expect, it } from "vitest";
import {
  computePatchStats,
  decodeGitPath,
  GitError,
  GitRepository,
  parseGitDiff,
  type GitExecutor,
} from "../src/git/index.js";

describe("Git diff parser", () => {
  it("parses content changes without counting headers", () => {
    const files = parseGitDiff(`diff --git a/src/page.ts b/src/page.ts
index 1111111..2222222 100644
--- a/src/page.ts
+++ b/src/page.ts
@@ -1,3 +1,4 @@
 const first = 1;
-const oldValue = 2;
+const newValue = 3;
+const added = 4;
 context
`);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      path: "src/page.ts",
      previousPath: "src/page.ts",
      kind: "modified",
      additions: 2,
      deletions: 1,
      binary: false,
    });
  });

  it("counts content that resembles patch markers when it occurs inside a hunk", () => {
    const files = parseGitDiff(`diff --git a/markers.txt b/markers.txt
--- a/markers.txt
+++ b/markers.txt
@@ -1 +1 @@
--- removed markdown rule
+++ added markdown rule
`);
    expect(files[0]).toMatchObject({ additions: 1, deletions: 1 });
  });

  it("parses renames with spaces and binary additions", () => {
    const files = parseGitDiff(`diff --git a/old name.ts b/new name.ts
similarity index 100%
rename from old name.ts
rename to new name.ts
diff --git a/assets/pixel.png b/assets/pixel.png
new file mode 100644
index 0000000..1111111
Binary files /dev/null and b/assets/pixel.png differ
`);
    expect(files[0]).toMatchObject({
      path: "new name.ts",
      previousPath: "old name.ts",
      kind: "renamed",
    });
    expect(files[1]).toMatchObject({
      path: "assets/pixel.png",
      kind: "added",
      binary: true,
      additions: 0,
      deletions: 0,
    });
  });

  it("decodes Git octal-escaped UTF-8 filenames", () => {
    expect(decodeGitPath('"caf\\303\\251.ts"')).toBe("café.ts");
    const files = parseGitDiff(`diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"
--- "a/caf\\303\\251.ts"
+++ "b/caf\\303\\251.ts"
@@ -1 +1 @@
-old
+new
`);
    expect(files[0]?.path).toBe("café.ts");
  });

  it("computes aggregate and test-file statistics", () => {
    const files = parseGitDiff(`diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1,2 @@
 a
+b
diff --git a/tests/a.test.ts b/tests/a.test.ts
--- a/tests/a.test.ts
+++ b/tests/a.test.ts
@@ -1 +1 @@
-old
+new
`);
    expect(computePatchStats(files)).toEqual({
      filesChanged: 2,
      additions: 2,
      deletions: 1,
      testFilesChanged: 1,
    });
  });
});

describe("GitRepository", () => {
  it("resolves refs and reads files without invoking a shell", async () => {
    const commit = "b".repeat(40);
    const seen: readonly string[][] = [];
    const mutableSeen = seen as string[][];
    const executor: GitExecutor = async (args) => {
      mutableSeen.push([...args]);
      if (args[0] === "rev-parse") return { stdout: `${commit}\n`, stderr: "", exitCode: 0 };
      if (args[0] === "cat-file") return { stdout: "", stderr: "", exitCode: 0 };
      if (args[0] === "show") return { stdout: "version: 1\n", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "unexpected", exitCode: 1 };
    };
    const repository = new GitRepository(process.cwd(), executor);

    await expect(repository.resolveRef("origin/main")).resolves.toBe(commit);
    await expect(repository.getFileAtRef("origin/main", ".patchproof/policy.yml")).resolves.toBe(
      "version: 1\n",
    );
    expect(seen.some((args) => args[0] === "show" && args[1] === `${commit}:.patchproof/policy.yml`)).toBe(true);
  });

  it("rejects unsafe refs and repository paths", async () => {
    const commit = "c".repeat(40);
    const executor: GitExecutor = async () => ({ stdout: commit, stderr: "", exitCode: 0 });
    const repository = new GitRepository(process.cwd(), executor);
    await expect(repository.resolveRef("--upload-pack=evil")).rejects.toBeInstanceOf(GitError);
    await expect(repository.getFileAtRef("HEAD", "../policy.yml")).rejects.toBeInstanceOf(GitError);
  });

  it("gives clear errors for missing refs", async () => {
    const executor: GitExecutor = async () => ({
      stdout: "",
      stderr: "fatal: ambiguous argument",
      exitCode: 128,
    });
    const repository = new GitRepository(process.cwd(), executor);
    await expect(repository.resolveRef("does-not-exist")).rejects.toThrow(/does-not-exist/u);
  });
});
