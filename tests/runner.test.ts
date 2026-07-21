import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandSpec } from "../src/types.js";
import { CommandRunner } from "../src/runner/index.js";

const sandbox = join(process.cwd(), "tests", ".runner-sandbox");
const outsideSandbox = join(process.cwd(), "tests", ".runner-outside");

function spec(run: string, timeoutMs = 5_000): CommandSpec {
  return { id: "test-command", run, timeoutMs, required: true };
}

describe("CommandRunner", () => {
  beforeEach(async () => {
    await mkdir(join(sandbox, "nested"), { recursive: true });
    await mkdir(outsideSandbox, { recursive: true });
  });
  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
    await rm(outsideSandbox, { recursive: true, force: true });
  });

  it("captures output, exit status, cwd, and timestamps", async () => {
    const runner = new CommandRunner({ cwd: sandbox });
    const result = await runner.run(spec('node -e "process.stdout.write(\'proof\'); process.stderr.write(\'note\')"'));
    expect(result).toMatchObject({
      stdout: "proof",
      stderr: "note",
      exitCode: 0,
      timedOut: false,
      aborted: false,
      succeeded: true,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(result.completedAt)).toBeGreaterThanOrEqual(Date.parse(result.startedAt));
  });

  it("redacts explicit and environment-derived secrets", async () => {
    const runner = new CommandRunner({ cwd: sandbox, redactions: ["policy-secret-value"] });
    const command = 'node -e "console.log(process.env.PATCHPROOF_API_TOKEN); console.log(\'policy-secret-value\')"';
    const result = await runner.run(spec(command), {
      env: { PATCHPROOF_API_TOKEN: "environment-secret-value" },
    });
    expect(result.stdout).toContain("[REDACTED]");
    expect(result.stdout).not.toContain("environment-secret-value");
    expect(result.stdout).not.toContain("policy-secret-value");
    expect(result.command).not.toContain("policy-secret-value");
  });

  it("omits host secrets unless the command explicitly inherits them", async () => {
    const runner = new CommandRunner({
      cwd: sandbox,
      env: { PATCHPROOF_HOST_SECRET: "host-only-secret-value" },
    });
    const command =
      'node -e "console.log(process.env.PATCHPROOF_HOST_SECRET === undefined ? \'missing\' : \'present\')"';

    const omitted = await runner.run(spec(command));
    const inherited = await runner.run({
      ...spec(command),
      inheritEnv: ["PATCHPROOF_HOST_SECRET"],
    });

    expect(omitted.stdout.trim()).toBe("missing");
    expect(inherited.stdout.trim()).toBe("present");
  });

  it("truncates captured output to a bounded size", async () => {
    const runner = new CommandRunner({ cwd: sandbox, maxCaptureBytes: 128 });
    const result = await runner.run(spec('node -e "process.stdout.write(\'x\'.repeat(10000))"'));
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout).toContain("[output truncated");
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(128);
  });

  it("terminates commands after their deadline", async () => {
    const runner = new CommandRunner({ cwd: sandbox, killGraceMs: 100 });
    const result = await runner.run(spec('node -e "setTimeout(() => {}, 5000)"', 200));
    expect(result.timedOut).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.durationMs).toBeLessThan(3_000);
  });

  it("confines command working directories to the repository", async () => {
    const runner = new CommandRunner({ cwd: sandbox });
    await expect(
      runner.run({ ...spec('node -e ""'), cwd: "../outside" }),
    ).rejects.toThrow(/escapes the repository/u);
  });

  it("rejects a command cwd that escapes through a directory symlink", async (context) => {
    const link = join(sandbox, "escape-link");
    try {
      await symlink(outsideSandbox, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (["EACCES", "EPERM", "ENOTSUP", "UNKNOWN"].includes(code ?? "")) {
        context.skip();
        return;
      }
      throw error;
    }

    const runner = new CommandRunner({ cwd: sandbox });
    await expect(
      runner.run({ ...spec('node -e ""'), cwd: "escape-link" }),
    ).rejects.toThrow(/escapes the repository/u);
  });
});
