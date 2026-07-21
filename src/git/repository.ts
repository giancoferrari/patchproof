import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";
import type { PatchSnapshot } from "../types.js";
import { sha256 } from "../utils/hash.js";
import { normalizeRepositoryPath } from "../utils/glob.js";
import { computePatchStats, parseGitDiff } from "./diff.js";
import { GitError } from "./errors.js";

export interface GitExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitExecutionOptions {
  cwd: string;
  maxBufferBytes?: number;
}

export type GitExecutor = (
  args: readonly string[],
  options: GitExecutionOptions,
) => Promise<GitExecutionResult>;

export interface GitRepositoryLike {
  resolveRef(ref: string): Promise<string>;
  getFileAtRef(ref: string, path: string): Promise<string | null>;
}

export interface ComparisonRefs {
  baseRef: string;
  headRef: string;
  baseCommit: string;
  headCommit: string;
}

export class GitRepository implements GitRepositoryLike {
  readonly root: string;
  readonly #execute: GitExecutor;

  constructor(root: string, executor: GitExecutor = executeGit) {
    this.root = resolve(root);
    this.#execute = executor;
  }

  static async discover(start = process.cwd(), executor: GitExecutor = executeGit): Promise<GitRepository> {
    const result = await executor(["rev-parse", "--show-toplevel"], { cwd: resolve(start) });
    if (result.exitCode !== 0) {
      throw gitFailure(["rev-parse", "--show-toplevel"], result);
    }
    const root = result.stdout.trim();
    if (root.length === 0) throw new GitError("Git returned an empty repository root", [], 0, "");
    return new GitRepository(root, executor);
  }

  async resolveRef(ref: string): Promise<string> {
    validateRef(ref);
    const args = ["rev-parse", "--verify", `${ref}^{commit}`];
    const result = await this.#execute(args, { cwd: this.root });
    const commit = result.stdout.trim();
    if (result.exitCode !== 0 || !/^[a-f\d]{40,64}$/iu.test(commit)) {
      throw new GitError(
        `Unable to resolve Git ref '${ref}' to a commit`,
        args,
        result.exitCode,
        result.stderr,
      );
    }
    return commit.toLowerCase();
  }

  async hasRef(ref: string): Promise<boolean> {
    try {
      await this.resolveRef(ref);
      return true;
    } catch (error) {
      if (error instanceof GitError) return false;
      throw error;
    }
  }

  async resolveComparisonRefs(baseRef: string, headRef = "HEAD"): Promise<ComparisonRefs> {
    const [baseCommit, headCommit] = await Promise.all([
      this.resolveRef(baseRef),
      this.resolveRef(headRef),
    ]);
    return { baseRef, headRef, baseCommit, headCommit };
  }

  async resolveDefaultBaseRef(): Promise<string> {
    const upstream = await this.runAllowFailure(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    if (upstream.exitCode === 0 && upstream.stdout.trim()) return upstream.stdout.trim();

    const remoteHead = await this.runAllowFailure(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
    if (remoteHead.exitCode === 0 && remoteHead.stdout.trim()) return remoteHead.stdout.trim();

    for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
      if (await this.hasRef(candidate)) return candidate;
    }
    throw new GitError(
      "Unable to determine a base ref; pass one explicitly",
      [],
      null,
      "No upstream, origin/HEAD, main, or master ref exists",
    );
  }

  async getFileAtRef(ref: string, path: string): Promise<string | null> {
    const commit = await this.resolveRef(ref);
    const repositoryPath = validateRepositoryPath(path);
    const object = `${commit}:${repositoryPath}`;
    const exists = await this.runAllowFailure(["cat-file", "-e", object]);
    if (exists.exitCode !== 0) return null;

    const result = await this.#execute(["show", object], {
      cwd: this.root,
      maxBufferBytes: 64 * 1024 * 1024,
    });
    if (result.exitCode !== 0) throw gitFailure(["show", object], result);
    return result.stdout;
  }

  async getDiff(baseRef: string, headRef = "HEAD"): Promise<string> {
    const { baseCommit, headCommit } = await this.resolveComparisonRefs(baseRef, headRef);
    const args = [
      "diff",
      "--no-ext-diff",
      "--binary",
      "--find-renames",
      "--find-copies",
      "--full-index",
      baseCommit,
      headCommit,
      "--",
    ];
    const result = await this.#execute(args, {
      cwd: this.root,
      maxBufferBytes: 256 * 1024 * 1024,
    });
    if (result.exitCode !== 0) throw gitFailure(args, result);
    return result.stdout;
  }

  async currentBranch(): Promise<string | null> {
    const result = await this.runAllowFailure(["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : null;
  }

  async assertCommandCheckout(expectedHeadCommit: string): Promise<void> {
    const actualHeadCommit = await this.resolveRef("HEAD");
    if (actualHeadCommit !== expectedHeadCommit.toLowerCase()) {
      throw new GitError(
        "Verification commands must run from the exact commit recorded as the patch head",
        ["rev-parse", "HEAD"],
        null,
        `Checked out ${actualHeadCommit}; proof head is ${expectedHeadCommit}. Check out the requested head or use --no-commands.`,
      );
    }

    const status = await this.runAllowFailure([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    if (status.exitCode !== 0) throw gitFailure(["status", "--porcelain=v1"], status);
    if (status.stdout.length > 0) {
      const entries = status.stdout.split("\0").filter(Boolean);
      throw new GitError(
        "Verification commands require a clean working tree",
        ["status", "--porcelain=v1"],
        null,
        `${entries.length} changed or untracked path${entries.length === 1 ? " is" : "s are"} present. Commit, stash, or use --no-commands.`,
      );
    }
  }

  async mergeBase(leftRef: string, rightRef: string): Promise<string> {
    const [left, right] = await Promise.all([this.resolveRef(leftRef), this.resolveRef(rightRef)]);
    const args = ["merge-base", left, right];
    const result = await this.#execute(args, { cwd: this.root });
    const commit = result.stdout.trim();
    if (result.exitCode !== 0 || !/^[a-f\d]{40,64}$/iu.test(commit)) {
      throw gitFailure(args, result);
    }
    return commit.toLowerCase();
  }

  async snapshot(baseRef: string, headRef = "HEAD"): Promise<PatchSnapshot> {
    const refs = await this.resolveComparisonRefs(baseRef, headRef);
    const [diff, branch] = await Promise.all([
      this.getDiff(refs.baseCommit, refs.headCommit),
      this.currentBranch(),
    ]);
    const files = parseGitDiff(diff);
    return {
      repositoryRoot: ".",
      repositoryName: basename(this.root),
      branch,
      baseRef,
      headRef,
      baseCommit: refs.baseCommit,
      headCommit: refs.headCommit,
      diff,
      diffDigest: sha256(diff),
      files,
      stats: computePatchStats(files),
    };
  }

  async run(args: readonly string[]): Promise<GitExecutionResult> {
    const result = await this.#execute(args, { cwd: this.root });
    if (result.exitCode !== 0) throw gitFailure(args, result);
    return result;
  }

  private async runAllowFailure(args: readonly string[]): Promise<GitExecutionResult> {
    return this.#execute(args, { cwd: this.root });
  }
}

export async function executeGit(
  args: readonly string[],
  options: GitExecutionOptions,
): Promise<GitExecutionResult> {
  const maxBufferBytes = options.maxBufferBytes ?? 8 * 1024 * 1024;
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(
        new GitError(`Unable to execute Git: ${error.message}`, args, null, "", { cause: error }),
      );
    };

    child.on("error", fail);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxBufferBytes) stdout.push(chunk);
      else child.kill();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBufferBytes) stderr.push(chunk);
      else child.kill();
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      if (stdoutBytes > maxBufferBytes || stderrBytes > maxBufferBytes) {
        reject(
          new GitError(
            `Git output exceeded ${maxBufferBytes} bytes`,
            args,
            exitCode,
            Buffer.concat(stderr).toString("utf8"),
          ),
        );
        return;
      }
      resolvePromise({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: exitCode ?? 1,
      });
    });
  });
}

function validateRef(ref: string): void {
  if (ref.trim().length === 0) throw new GitError("Git ref must not be empty", [], null, "");
  if (ref.startsWith("-") || ref.includes("\0") || /[\r\n]/u.test(ref)) {
    throw new GitError(`Unsafe Git ref '${ref}'`, [], null, "");
  }
}

function validateRepositoryPath(path: string): string {
  if (/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(path) || path.includes("\0")) {
    throw new GitError(`Unsafe repository path '${path}'`, [], null, "");
  }
  const normalized = normalizeRepositoryPath(path);
  if (normalized.split("/").some((segment) => segment === "..") || normalized.length === 0) {
    throw new GitError(`Unsafe repository path '${path}'`, [], null, "");
  }
  return normalized;
}

function gitFailure(args: readonly string[], result: GitExecutionResult): GitError {
  const detail = result.stderr.trim() || result.stdout.trim() || "unknown Git error";
  return new GitError(
    `git ${args.join(" ")} failed with exit code ${result.exitCode}: ${detail}`,
    args,
    result.exitCode,
    result.stderr,
  );
}
