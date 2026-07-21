import * as crypto from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import { stableId } from "./id.js";

export { canonicalJson, stableId };

export type HashInput = string | Buffer | Uint8Array;

export function sha256(input: HashInput): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sha256Json(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function verifySha256(input: HashInput, expectedDigest: string): boolean {
  if (!/^[a-f\d]{64}$/iu.test(expectedDigest)) return false;

  const actual = Buffer.from(sha256(input), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
