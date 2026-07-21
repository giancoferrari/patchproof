import type { ChangeKind, FileChange, PatchStats } from "../types.js";
import { isTestPath, normalizeRepositoryPath } from "../utils/glob.js";

interface MutableChange {
  path: string;
  previousPath?: string;
  kind: ChangeKind;
  additions: number;
  deletions: number;
  binary: boolean;
  patch: string;
}

/** Parse the standard unified patch produced by `git diff --binary`. */
export function parseGitDiff(diff: string): FileChange[] {
  if (diff.length === 0) return [];

  const starts: number[] = [];
  const headerPattern = /^diff --git .*(?:\r?\n|$)/gmu;
  for (const match of diff.matchAll(headerPattern)) {
    if (match.index !== undefined) starts.push(match.index);
  }

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? diff.length;
    return parseSection(diff.slice(start, end));
  });
}

export const parseDiff = parseGitDiff;

export function computePatchStats(files: readonly FileChange[]): PatchStats {
  return {
    filesChanged: files.length,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
    testFilesChanged: files.filter((file) =>
      isTestPath(file.kind === "deleted" && file.previousPath ? file.previousPath : file.path),
    ).length,
  };
}

export const calculatePatchStats = computePatchStats;

function parseSection(section: string): FileChange {
  const lines = section.split(/\r?\n/u);
  const header = lines[0] ?? "";
  const headerPaths = parseHeaderPaths(header.slice("diff --git ".length));
  const change: MutableChange = {
    path: headerPaths.newPath,
    previousPath: headerPaths.oldPath,
    kind: "modified",
    additions: 0,
    deletions: 0,
    binary: false,
    patch: section,
  };

  let oldMarkerPath: string | undefined;
  let newMarkerPath: string | undefined;
  let inHunk = false;

  for (const line of lines.slice(1)) {
    if (line.startsWith("@@ ") || line.startsWith("@@@ ")) {
      inHunk = true;
    } else if (inHunk && line.startsWith("+")) {
      change.additions += 1;
    } else if (inHunk && line.startsWith("-")) {
      change.deletions += 1;
    } else if (line.startsWith("new file mode ")) {
      change.kind = "added";
    } else if (line.startsWith("deleted file mode ")) {
      change.kind = "deleted";
    } else if (line.startsWith("rename from ")) {
      change.kind = "renamed";
      change.previousPath = normalizeParsedPath(line.slice("rename from ".length), false);
    } else if (line.startsWith("rename to ")) {
      change.kind = "renamed";
      change.path = normalizeParsedPath(line.slice("rename to ".length), false);
    } else if (line.startsWith("copy from ")) {
      change.kind = "copied";
      change.previousPath = normalizeParsedPath(line.slice("copy from ".length), false);
    } else if (line.startsWith("copy to ")) {
      change.kind = "copied";
      change.path = normalizeParsedPath(line.slice("copy to ".length), false);
    } else if (line.startsWith("Binary files ") || line === "GIT binary patch") {
      change.binary = true;
    } else if (line.startsWith("--- ")) {
      oldMarkerPath = markerPath(line.slice(4));
      inHunk = false;
    } else if (line.startsWith("+++ ")) {
      newMarkerPath = markerPath(line.slice(4));
      inHunk = false;
    }
  }

  if (change.kind !== "renamed" && change.kind !== "copied") {
    if (oldMarkerPath && oldMarkerPath !== "/dev/null") {
      change.previousPath = oldMarkerPath;
    }
    if (newMarkerPath && newMarkerPath !== "/dev/null") {
      change.path = newMarkerPath;
    }
  }

  if (change.kind === "added") {
    delete change.previousPath;
  } else if (change.kind === "deleted") {
    const deletedPath = oldMarkerPath ?? change.previousPath ?? change.path;
    change.path = deletedPath;
    change.previousPath = deletedPath;
  }

  if (change.path.length === 0) change.path = headerPaths.newPath || headerPaths.oldPath;
  return change;
}

function parseHeaderPaths(header: string): { oldPath: string; newPath: string } {
  const quoted = tokenizeGitHeader(header);
  if (quoted.length === 2) {
    return {
      oldPath: normalizeParsedPath(quoted[0] ?? "", true),
      newPath: normalizeParsedPath(quoted[1] ?? "", true),
    };
  }

  // Git usually leaves spaces unquoted. The separator is the space immediately
  // before the `b/` side; marker lines later disambiguate pathological names.
  const separator = header.indexOf(" b/");
  if (separator >= 0) {
    return {
      oldPath: normalizeParsedPath(header.slice(0, separator), true),
      newPath: normalizeParsedPath(header.slice(separator + 1), true),
    };
  }

  const fallback = normalizeParsedPath(header, true);
  return { oldPath: fallback, newPath: fallback };
}

function tokenizeGitHeader(input: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < input.length) {
    while (input[index] === " ") index += 1;
    if (index >= input.length) break;
    if (input[index] !== '"') return [];

    const start = index;
    index += 1;
    let escaped = false;
    while (index < input.length) {
      const character = input[index];
      if (!escaped && character === '"') {
        index += 1;
        tokens.push(input.slice(start, index));
        break;
      }
      if (!escaped && character === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
      index += 1;
    }
  }
  return tokens;
}

function markerPath(value: string): string {
  // A timestamp, when present, is separated from the path by a tab.
  const withoutTimestamp = value.split("\t", 1)[0] ?? value;
  if (withoutTimestamp === "/dev/null") return withoutTimestamp;
  return normalizeParsedPath(withoutTimestamp, true);
}

function normalizeParsedPath(value: string, stripPrefix: boolean): string {
  let path = decodeGitPath(value.trim());
  if (stripPrefix && (path.startsWith("a/") || path.startsWith("b/"))) {
    path = path.slice(2);
  }
  return normalizeRepositoryPath(path);
}

/** Decode Git's core.quotePath C-style filename representation. */
export function decodeGitPath(value: string): string {
  if (!(value.startsWith('"') && value.endsWith('"'))) return value;

  const bytes: number[] = [];
  const inner = value.slice(1, -1);
  const escapeBytes: Record<string, number> = {
    a: 0x07,
    b: 0x08,
    t: 0x09,
    n: 0x0a,
    v: 0x0b,
    f: 0x0c,
    r: 0x0d,
    '"': 0x22,
    "\\": 0x5c,
  };

  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index] ?? "";
    if (character !== "\\") {
      const codePoint = inner.codePointAt(index);
      const decoded = codePoint === undefined ? character : String.fromCodePoint(codePoint);
      bytes.push(...Buffer.from(decoded));
      if ((codePoint ?? 0) > 0xffff) index += 1;
      continue;
    }

    const next = inner[index + 1] ?? "";
    if (/^[0-7]$/u.test(next)) {
      let octal = next;
      let consumed = 1;
      while (consumed < 3 && /^[0-7]$/u.test(inner[index + consumed + 1] ?? "")) {
        octal += inner[index + consumed + 1];
        consumed += 1;
      }
      bytes.push(Number.parseInt(octal, 8));
      index += consumed;
      continue;
    }

    bytes.push(escapeBytes[next] ?? Buffer.from(next)[0] ?? 0);
    index += 1;
  }

  return Buffer.from(bytes).toString("utf8");
}
