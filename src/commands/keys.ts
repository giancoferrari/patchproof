import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import pc from "picocolors";
import {
  generateSigningKeyPair,
  readProofBundle,
  signProofBundle,
  verifyProofBundle,
  writeProofBundle,
} from "../proof/index.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function generateKeys(
  privatePath: string,
  publicPath: string,
  cwd: string,
  force: boolean,
): Promise<void> {
  const resolvedPrivate = resolve(cwd, privatePath);
  const resolvedPublic = resolve(cwd, publicPath);
  if (!force && ((await exists(resolvedPrivate)) || (await exists(resolvedPublic)))) {
    throw new Error("A signing key already exists. Pass --force to replace both files.");
  }
  const pair = generateSigningKeyPair();
  await Promise.all([
    mkdir(dirname(resolvedPrivate), { recursive: true }),
    mkdir(dirname(resolvedPublic), { recursive: true }),
  ]);
  await writeFile(resolvedPrivate, pair.privateKey, { encoding: "utf8", mode: 0o600 });
  await writeFile(resolvedPublic, pair.publicKey, { encoding: "utf8", mode: 0o644 });
  process.stdout.write(`${pc.green("Signing key created")} ${pair.keyId}\n`);
  process.stdout.write(`  private  ${resolvedPrivate}\n  public   ${resolvedPublic}\n`);
}

export async function signBundle(
  input: string,
  key: string,
  output: string,
  cwd: string,
): Promise<void> {
  const bundle = await readProofBundle(resolve(cwd, input));
  const signed = signProofBundle(bundle, await readFile(resolve(cwd, key), "utf8"));
  await mkdir(dirname(resolve(cwd, output)), { recursive: true });
  await writeProofBundle(resolve(cwd, output), signed);
  process.stdout.write(`${pc.green("Proof signed")} ${signed.attestation?.keyId ?? "unknown key"}\n`);
}

export async function verifyBundleCommand(input: string, cwd: string, json: boolean): Promise<void> {
  const bundle = await readProofBundle(resolve(cwd, input));
  const result = verifyProofBundle(bundle);
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (result.valid) {
    process.stdout.write(`${pc.green("Valid proof bundle")} · signature ${result.signature}\n`);
  } else {
    process.stdout.write(`${pc.red("Invalid proof bundle")}\n${result.errors.map((error) => `  - ${error}`).join("\n")}\n`);
  }
  if (!result.valid) process.exitCode = 1;
}
