/**
 * Serialize a JSON value with deterministic object-key ordering.
 *
 * This follows the parts of RFC 8785 that are relevant to values produced by
 * PatchProof: UTF-16 property ordering and ECMAScript's JSON representation for
 * strings and finite numbers. Unsupported JavaScript values are rejected rather
 * than silently changing the data that is about to be hashed or signed.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value, new Set<object>(), "$", false);
}

export const canonicalize = canonicalJson;
export const stableStringify = canonicalJson;

function serialize(
  value: unknown,
  ancestors: Set<object>,
  path: string,
  arrayElement: boolean,
): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError(`Cannot canonicalize non-finite number at ${path}`);
      }
      return JSON.stringify(value);
    }
    case "undefined":
      if (arrayElement) return "null";
      throw new TypeError(`Cannot canonicalize undefined at ${path}`);
    case "bigint":
    case "symbol":
    case "function":
      throw new TypeError(`Cannot canonicalize ${typeof value} at ${path}`);
    case "object":
      break;
  }

  const object = value as object;
  if (ancestors.has(object)) {
    throw new TypeError(`Cannot canonicalize circular structure at ${path}`);
  }

  // Match JSON.stringify's treatment of objects with an explicit toJSON method,
  // while still rejecting exotic objects that could otherwise serialize as {}.
  const withToJson = object as { toJSON?: (key?: string) => unknown };
  if (typeof withToJson.toJSON === "function") {
    return serialize(withToJson.toJSON(), ancestors, path, arrayElement);
  }

  ancestors.add(object);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        items.push(serialize(value[index], ancestors, `${path}[${index}]`, true));
      }
      return `[${items.join(",")}]`;
    }

    if (!isPlainObject(value)) {
      const name = value.constructor?.name ?? "object";
      throw new TypeError(`Cannot canonicalize non-plain ${name} at ${path}`);
    }

    const entries: string[] = [];
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareUtf16);

    for (const key of keys) {
      const item = record[key];
      // JSON objects omit undefined properties. We do the same so callers can
      // canonicalize ordinary typed objects with absent optional properties.
      if (item === undefined) continue;
      const rendered = serialize(item, ancestors, propertyPath(path, key), false);
      entries.push(`${JSON.stringify(key)}:${rendered}`);
    }

    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(object);
  }
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function propertyPath(parent: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}
