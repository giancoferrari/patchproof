import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packageRoot = resolve(process.argv[2] || ".");
const cli = join(packageRoot, "dist/cli.js");
const api = await import(pathToFileURL(join(packageRoot, "dist/index.js")).href);
const root = await mkdtemp(join(tmpdir(), "patchproof-package-smoke-"));

async function run(args, expectedExit = 0) {
  try {
    const result = await exec(process.execPath, [cli, "--cwd", root, ...args], { windowsHide: true });
    assert.equal(expectedExit, 0, `Expected failure from ${args[0]}`);
    return result.stdout;
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    assert.equal(error.code, expectedExit, `${args[0]}: ${error.stderr}`);
    return error.stdout;
  }
}

try {
  const demo = api.parseProofBundle(JSON.parse(await readFile(new URL("../examples/demo-proof.json", import.meta.url), "utf8")));
  assert.equal(api.verifyProofBundle(demo).valid, true);
  await writeFile(join(root, "proof.json"), JSON.stringify(demo));
  await run(["keygen"]);
  await run(["sign", "proof.json", "--key", ".patchproof/keys/patchproof-private.pem", "--output", "signed.json"]);
  const trusted = ["verify-bundle", "signed.json", "--trusted-key", ".patchproof/keys/patchproof-public.pem", "--expected-head", demo.patch.headCommit, "--json"];
  assert.equal(JSON.parse(await run(trusted)).valid, true);
  assert.equal(JSON.parse(await run([...trusted, "--require-verified"], 1)).valid, false);
  assert.equal(JSON.parse(await run(["verify-bundle", "proof.json", "--require-signature", "--json"], 1)).valid, false);
  await writeFile(join(root, "malformed.json"), "null");
  assert.equal(JSON.parse(await run(["verify-bundle", "malformed.json", "--json"], 1)).valid, false);
  await run(["report", "signed.json", "--format", "markdown", "--output", "review.md"]);
  assert.match(await readFile(join(root, "review.md"), "utf8"), /## PatchProof: rejected/u);
  const comparison = JSON.parse(await run(["compare", "proof.json", "signed.json", "--json", "--fail-on-regression"]));
  assert.equal(comparison.comparable, true);
  assert.deepEqual(comparison.regressions, []);
  assert.equal(JSON.parse(await run(["doctor", "--json"], 1)).ready, false);
  process.stdout.write("Package smoke test passed: trusted signatures, acceptance gates, malformed input, Markdown, comparison, and diagnostics.\n");
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
