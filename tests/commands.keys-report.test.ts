import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateKeys,
  generateReport,
  signBundle,
  verifyBundleCommand,
} from "../src/commands/index.js";
import {
  readProofBundle,
  verifyProofBundle,
  writeProofBundle,
} from "../src/proof/index.js";
import { createDemoBundle } from "../src/report/demo.js";

const temporaryDirectories: string[] = [];
let originalExitCode: number | string | null | undefined;
let stdout = "";

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patchproof-command-keys-"));
  temporaryDirectories.push(root);
  return root;
}

beforeEach(() => {
  originalExitCode = process.exitCode;
  process.exitCode = undefined;
  stdout = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write);
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("key commands", () => {
  it("creates protected key files, refuses an accidental overwrite, and force-replaces both", async () => {
    const root = await temporaryDirectory();
    const privatePath = ".patchproof/keys/private.pem";
    const publicPath = ".patchproof/keys/public.pem";

    await generateKeys(privatePath, publicPath, root, false);
    const firstPrivate = await readFile(join(root, privatePath), "utf8");
    const firstPublic = await readFile(join(root, publicPath), "utf8");
    expect(firstPrivate).toContain("BEGIN PRIVATE KEY");
    expect(firstPublic).toContain("BEGIN PUBLIC KEY");
    expect(stdout).toContain("Signing key created");

    await expect(generateKeys(privatePath, publicPath, root, false)).rejects.toThrow(
      /signing key already exists/iu,
    );

    await generateKeys(privatePath, publicPath, root, true);
    expect(await readFile(join(root, privatePath), "utf8")).not.toBe(firstPrivate);
    expect(await readFile(join(root, publicPath), "utf8")).not.toBe(firstPublic);
  });

  it("signs a proof and verifies valid and invalid bundles in JSON and human modes", async () => {
    const root = await temporaryDirectory();
    await generateKeys("private.pem", "public.pem", root, false);
    await writeProofBundle(join(root, "proof.json"), createDemoBundle());
    stdout = "";

    await signBundle("proof.json", "private.pem", "nested/signed.json", root);
    const signed = await readProofBundle(join(root, "nested", "signed.json"));
    expect(verifyProofBundle(signed)).toEqual({ valid: true, errors: [], signature: "valid" });
    expect(stdout).toContain("Proof signed");

    stdout = "";
    await verifyBundleCommand("nested/signed.json", root, true);
    expect(JSON.parse(stdout.trim())).toEqual({ valid: true, errors: [], signature: "valid" });
    expect(process.exitCode).toBeUndefined();

    stdout = "";
    await verifyBundleCommand("nested/signed.json", root, false);
    expect(stdout).toContain("Valid proof bundle");

    const invalid = structuredClone(createDemoBundle());
    invalid.contentDigest = "0".repeat(64);
    await writeProofBundle(join(root, "invalid.json"), invalid);
    stdout = "";
    await verifyBundleCommand("invalid.json", root, false);
    expect(stdout).toContain("Invalid proof bundle");
    expect(stdout).toContain("content digest");
    expect(process.exitCode).toBe(1);
  });
});

describe("report command", () => {
  it("renders a verified proof and refuses a tampered bundle", async () => {
    const root = await temporaryDirectory();
    await writeProofBundle(join(root, "valid.json"), createDemoBundle());

    await generateReport("valid.json", "reports/proof.html", root);
    const report = await readFile(join(root, "reports", "proof.html"), "utf8");
    expect(report).toContain("<!doctype html>");
    expect(report).toContain("PatchProof");
    expect(stdout).toContain("Report written");

    const invalid = structuredClone(createDemoBundle());
    invalid.contentDigest = "0".repeat(64);
    await writeProofBundle(join(root, "invalid.json"), invalid);
    await expect(
      generateReport("invalid.json", "reports/invalid.html", root),
    ).rejects.toThrow(/Refusing to render an invalid proof bundle/iu);
    await expect(access(join(root, "reports", "invalid.html"))).rejects.toBeDefined();
  });
});
