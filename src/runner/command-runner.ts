import { spawn, type ChildProcess } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { DEFAULT_COMMAND_TIMEOUT_MS, MAX_CAPTURE_BYTES } from "../constants.js";
import type { CommandSpec } from "../types.js";
import {
  redactSecrets,
  secretValuesFromEnvironment,
  type RedactionOptions,
} from "../utils/redaction.js";

export interface CommandRunnerOptions {
  /** Repository root. Command cwd values are confined beneath it. */
  cwd: string;
  env?: NodeJS.ProcessEnv;
  maxCaptureBytes?: number;
  redactions?: readonly string[];
  redactionPatterns?: readonly RegExp[];
  killGraceMs?: number;
}

export interface CommandInvocationOptions {
  env?: NodeJS.ProcessEnv;
  redactions?: readonly string[];
  redactionPatterns?: readonly RegExp[];
  signal?: AbortSignal;
}

export interface CommandRunResult {
  id: string;
  command: string;
  cwd: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  aborted: boolean;
  succeeded: boolean;
}

interface CapturedOutput {
  text: string;
  truncated: boolean;
}

class BoundedCapture {
  readonly #chunks: Buffer[] = [];
  readonly #rawLimit: number;
  #storedBytes = 0;
  totalBytes = 0;

  constructor(maxCaptureBytes: number, redactionLookaheadBytes: number) {
    this.#rawLimit = maxCaptureBytes + redactionLookaheadBytes;
  }

  push(chunk: Buffer | string): void {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    this.totalBytes += buffer.length;
    const remaining = this.#rawLimit - this.#storedBytes;
    if (remaining <= 0) return;
    const stored = buffer.length <= remaining ? buffer : buffer.subarray(0, remaining);
    this.#chunks.push(stored);
    this.#storedBytes += stored.length;
  }

  finish(maxBytes: number, redactions: RedactionOptions): CapturedOutput {
    const redacted = redactSecrets(Buffer.concat(this.#chunks).toString("utf8"), redactions);
    const rendered = truncateUtf8(redacted, maxBytes, this.totalBytes);
    return {
      text: rendered.text,
      truncated: rendered.truncated || this.totalBytes > this.#storedBytes,
    };
  }
}

export class CommandRunner {
  readonly #root: string;
  readonly #hostEnvironment: NodeJS.ProcessEnv;
  readonly #baseEnvironment: NodeJS.ProcessEnv;
  readonly #maxCaptureBytes: number;
  readonly #redactions: readonly string[];
  readonly #redactionPatterns: readonly RegExp[];
  readonly #killGraceMs: number;

  constructor(options: CommandRunnerOptions) {
    this.#root = resolve(options.cwd);
    this.#hostEnvironment = { ...process.env, ...options.env };
    this.#baseEnvironment = safeEnvironment(this.#hostEnvironment);
    this.#maxCaptureBytes = validatePositiveInteger(
      options.maxCaptureBytes ?? MAX_CAPTURE_BYTES,
      "maxCaptureBytes",
    );
    this.#redactions = options.redactions ?? [];
    this.#redactionPatterns = options.redactionPatterns ?? [];
    this.#killGraceMs = validatePositiveInteger(options.killGraceMs ?? 1_000, "killGraceMs");
  }

  async run(spec: CommandSpec, options: CommandInvocationOptions = {}): Promise<CommandRunResult> {
    const timeoutMs = validatePositiveInteger(
      spec.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      "timeoutMs",
    );
    const cwd = await resolveConfinedCwd(this.#root, spec.cwd);
    const inheritedEnvironment = pickEnvironment(
      this.#hostEnvironment,
      spec.inheritEnv ?? [],
    );
    const environment: NodeJS.ProcessEnv = {
      ...this.#baseEnvironment,
      ...inheritedEnvironment,
      ...spec.env,
      ...options.env,
    };
    const exactSecrets = [
      ...this.#redactions,
      ...(options.redactions ?? []),
      ...secretValuesFromEnvironment(environment),
    ];
    const patterns = [...this.#redactionPatterns, ...(options.redactionPatterns ?? [])];
    const longestSecret = exactSecrets.reduce((length, secret) => Math.max(length, Buffer.byteLength(secret)), 0);
    // The lookahead lets a secret that crosses the capture boundary be fully
    // recognized before the externally visible output is truncated.
    const lookahead = Math.min(Math.max(longestSecret + 8, 8 * 1024), 1024 * 1024);

    return new Promise((resolvePromise, reject) => {
      const started = Date.now();
      const startedAt = new Date(started).toISOString();
      const stdout = new BoundedCapture(this.#maxCaptureBytes, lookahead);
      const stderr = new BoundedCapture(this.#maxCaptureBytes, lookahead);
      let timedOut = false;
      let aborted = false;
      let settled = false;
      let forceKillTimer: NodeJS.Timeout | undefined;

      const child = spawn(spec.run, {
        cwd,
        env: environment,
        shell: true,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });

      const terminate = (reason: "timeout" | "abort"): void => {
        if (reason === "timeout") timedOut = true;
        else aborted = true;
        terminateProcessTree(child, false);
        forceKillTimer = setTimeout(() => terminateProcessTree(child, true), this.#killGraceMs);
        forceKillTimer.unref();
      };

      const timeout = setTimeout(() => terminate("timeout"), timeoutMs);
      timeout.unref();

      const onAbort = (): void => terminate("abort");
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        options.signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
      child.on("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        options.signal?.removeEventListener("abort", onAbort);
        const completed = Date.now();
        const redactionOptions: RedactionOptions = {
          secrets: exactSecrets,
          patterns,
        };
        const capturedStdout = stdout.finish(this.#maxCaptureBytes, redactionOptions);
        const capturedStderr = stderr.finish(this.#maxCaptureBytes, redactionOptions);
        const redactedCommand = redactSecrets(spec.run, redactionOptions);
        resolvePromise({
          id: spec.id,
          command: redactedCommand,
          cwd,
          startedAt,
          completedAt: new Date(completed).toISOString(),
          durationMs: Math.max(0, completed - started),
          exitCode,
          signal,
          stdout: capturedStdout.text,
          stderr: capturedStderr.text,
          stdoutTruncated: capturedStdout.truncated,
          stderrTruncated: capturedStderr.truncated,
          timedOut,
          aborted,
          succeeded: !timedOut && !aborted && exitCode === 0,
        });
      });
    });
  }
}

export function runCommand(
  spec: CommandSpec,
  optionsOrCwd: CommandRunnerOptions | string,
  redactions: readonly string[] = [],
): Promise<CommandRunResult> {
  const options: CommandRunnerOptions =
    typeof optionsOrCwd === "string"
      ? { cwd: optionsOrCwd, redactions }
      : optionsOrCwd;
  return new CommandRunner(options).run(spec);
}

async function resolveConfinedCwd(root: string, requested?: string): Promise<string> {
  if (requested && isAbsolute(requested)) {
    throw new Error(`Command cwd must be relative to the repository: ${requested}`);
  }
  const target = resolve(root, requested ?? ".");
  const lexicalRelation = relative(root, target);
  if (isOutside(lexicalRelation)) {
    throw new Error(`Command cwd escapes the repository: ${requested ?? "."}`);
  }
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
  const relation = relative(realRoot, realTarget);
  if (isOutside(relation)) {
    throw new Error(`Command cwd escapes the repository: ${requested ?? "."}`);
  }
  return realTarget;
}

function isOutside(relation: string): boolean {
  return (
    relation === ".." ||
    relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relation)
  );
}

const SAFE_ENVIRONMENT_NAMES = new Set([
  "APPDATA",
  "CI",
  "COLORTERM",
  "COMSPEC",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "NO_COLOR",
  "PATH",
  "PATHEXT",
  "SHELL",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "WINDIR",
]);

function safeEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return pickEnvironment(source, SAFE_ENVIRONMENT_NAMES);
}

function pickEnvironment(
  source: NodeJS.ProcessEnv,
  names: Iterable<string>,
): NodeJS.ProcessEnv {
  const selected: NodeJS.ProcessEnv = {};
  for (const name of names) {
    const value = source[name];
    if (value !== undefined) selected[name] = value;
  }
  return selected;
}

function terminateProcessTree(child: ChildProcess, force: boolean): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGTERM";
  try {
    if (process.platform === "win32") {
      const taskkill = spawn("taskkill", ["/pid", String(child.pid), "/t", ...(force ? ["/f"] : [])], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      });
      taskkill.unref();
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    child.kill(signal);
  }
}

function truncateUtf8(
  input: string,
  maxBytes: number,
  rawTotalBytes: number,
): { text: string; truncated: boolean } {
  const buffer = Buffer.from(input);
  if (buffer.length <= maxBytes && rawTotalBytes <= maxBytes) {
    return { text: input, truncated: false };
  }

  const marker = `\n[output truncated; captured ${maxBytes} of at least ${rawTotalBytes} bytes]`;
  const markerBytes = Buffer.byteLength(marker);
  if (markerBytes >= maxBytes) {
    return {
      text: Buffer.from(marker).subarray(0, maxBytes).toString("utf8"),
      truncated: true,
    };
  }
  const contentLimit = Math.max(0, maxBytes - markerBytes);
  let end = Math.min(contentLimit, buffer.length);
  while (end > 0 && (buffer[end] ?? 0) >= 0x80 && (buffer[end] ?? 0) < 0xc0) end -= 1;
  return { text: `${buffer.subarray(0, end).toString("utf8")}${marker}`, truncated: true };
}

function validatePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}
