import { createHash } from "node:crypto";

const DEFAULT_DIGEST_LENGTH = 20;

/** Build an identifier that remains stable for the same semantic inputs. */
export function stableId(prefix: string, ...parts: readonly unknown[]): string {
  const safePrefix = normalizePrefix(prefix);
  const payload = parts
    .map((part) => (typeof part === "string" ? part : stablePart(part)))
    .join("\u001f");
  const digest = createHash("sha256").update(payload).digest("hex");
  return `${safePrefix}_${digest.slice(0, DEFAULT_DIGEST_LENGTH)}`;
}

export const createStableId = stableId;

function stablePart(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.description ?? "symbol";
  if (typeof value === "function") return value.name || "function";

  try {
    return JSON.stringify(value, sortedReplacer) ?? String(value);
  } catch {
    return String(value);
  }
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }
  return value;
}

function normalizePrefix(prefix: string): string {
  const normalized = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (normalized.length === 0) {
    throw new TypeError("Stable ID prefix must contain at least one letter or number");
  }
  return normalized;
}
