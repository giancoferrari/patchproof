import type { Analyzer, AnalyzerContext, AnalyzerResult, FileChange } from "../types.js";
import {
  changedPaths,
  evidenceStatusForFindings,
  makeEvidence,
  makeFinding,
  normalizePath,
  sortFindings,
  uniqueSortedPaths,
} from "./utils.js";

export const DEPENDENCY_REVIEW_ANALYZER_ID = "dependency-review";

type DependencyKind = "manifest" | "lockfile";
type Ecosystem = "node" | "python" | "go" | "rust" | "ruby" | "php";

interface DependencyDescriptor {
  path: string;
  directory: string;
  basename: string;
  ecosystem: Ecosystem;
  kind: DependencyKind;
  expectedPeers: string[];
}

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const INSTALL_HOOKS = ["preinstall", "install", "postinstall", "prepare"] as const;

function splitPath(path: string): { directory: string; basename: string } {
  const normalized = normalizePath(path);
  const separator = normalized.lastIndexOf("/");
  return separator < 0
    ? { directory: "", basename: normalized }
    : { directory: normalized.slice(0, separator), basename: normalized.slice(separator + 1) };
}

function joinPath(directory: string, basename: string): string {
  return directory.length === 0 ? basename : `${directory}/${basename}`;
}

function describeDependencyFile(path: string): DependencyDescriptor | null {
  const normalized = normalizePath(path);
  const { directory, basename } = splitPath(normalized);
  const lower = basename.toLowerCase();

  if (lower === "package.json") {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "node",
      kind: "manifest",
      expectedPeers: ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"],
    };
  }
  if (["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"].includes(lower)) {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "node",
      kind: "lockfile",
      expectedPeers: ["package.json"],
    };
  }
  if (lower === "pyproject.toml") {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "python",
      kind: "manifest",
      expectedPeers: ["poetry.lock", "uv.lock"],
    };
  }
  if (lower === "pipfile") {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "python",
      kind: "manifest",
      expectedPeers: ["Pipfile.lock"],
    };
  }
  if (/^requirements(?:[._-].+)?\.txt$/i.test(basename)) {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "python",
      kind: "manifest",
      expectedPeers: [],
    };
  }
  if (["poetry.lock", "uv.lock", "pipfile.lock"].includes(lower)) {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "python",
      kind: "lockfile",
      expectedPeers: lower === "pipfile.lock" ? ["Pipfile"] : ["pyproject.toml"],
    };
  }
  if (lower === "go.mod" || lower === "go.sum") {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "go",
      kind: lower === "go.mod" ? "manifest" : "lockfile",
      expectedPeers: [lower === "go.mod" ? "go.sum" : "go.mod"],
    };
  }
  if (lower === "cargo.toml" || lower === "cargo.lock") {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "rust",
      kind: lower === "cargo.toml" ? "manifest" : "lockfile",
      expectedPeers: [lower === "cargo.toml" ? "Cargo.lock" : "Cargo.toml"],
    };
  }
  if (lower === "gemfile" || lower === "gemfile.lock") {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "ruby",
      kind: lower === "gemfile" ? "manifest" : "lockfile",
      expectedPeers: [lower === "gemfile" ? "Gemfile.lock" : "Gemfile"],
    };
  }
  if (lower === "composer.json" || lower === "composer.lock") {
    return {
      path: normalized,
      directory,
      basename,
      ecosystem: "php",
      kind: lower === "composer.json" ? "manifest" : "lockfile",
      expectedPeers: [lower === "composer.json" ? "composer.lock" : "composer.json"],
    };
  }
  return null;
}

async function safeGetFile(
  context: AnalyzerContext,
  ref: string,
  path: string,
): Promise<string | null> {
  try {
    return await context.getFileAtRef(ref, path);
  } catch {
    return null;
  }
}

function asStringRecord(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      record[key] = entry;
    }
  }
  return record;
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function packageDependencyChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Array<{ name: string; value: string }> {
  if (after === null) {
    return [];
  }
  const changes = new Map<string, string>();
  for (const section of DEPENDENCY_SECTIONS) {
    const oldDependencies = asStringRecord(before?.[section]);
    const newDependencies = asStringRecord(after[section]);
    for (const [name, value] of Object.entries(newDependencies)) {
      if (oldDependencies[name] !== value) {
        changes.set(name, value);
      }
    }
  }
  return [...changes.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function addedInstallHooks(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  if (after === null) {
    return [];
  }
  const beforeScripts = asStringRecord(before?.scripts);
  const afterScripts = asStringRecord(after.scripts);
  return INSTALL_HOOKS.filter(
    (hook) => afterScripts[hook] !== undefined && afterScripts[hook] !== beforeScripts[hook],
  );
}

function remoteOrLocalSource(value: string): boolean {
  return /^(?:git(?:\+[^:]+)?:|https?:|github:|gitlab:|bitbucket:|file:|link:)/i.test(value.trim());
}

function companionManifestChanged(
  lock: DependencyDescriptor,
  changedDescriptors: readonly DependencyDescriptor[],
): boolean {
  return changedDescriptors.some(
    (candidate) =>
      candidate.kind === "manifest" &&
      candidate.ecosystem === lock.ecosystem &&
      (candidate.directory === lock.directory ||
        (lock.directory.length === 0 && candidate.directory.length > 0) ||
        candidate.directory.startsWith(`${lock.directory}/`)),
  );
}

async function existingExpectedLocks(
  context: AnalyzerContext,
  manifest: DependencyDescriptor,
): Promise<string[]> {
  const candidates = manifest.expectedPeers.map((peer) => joinPath(manifest.directory, peer));
  const existing: string[] = [];
  for (const candidate of candidates) {
    const [atBase, atHead] = await Promise.all([
      safeGetFile(context, context.patch.baseCommit, candidate),
      safeGetFile(context, context.patch.headCommit, candidate),
    ]);
    if (atBase !== null || atHead !== null) {
      existing.push(candidate);
    }
  }
  return existing;
}

function fileForDescriptor(
  descriptor: DependencyDescriptor,
  entries: readonly { file: FileChange; descriptor: DependencyDescriptor }[],
): FileChange | null {
  return entries.find((entry) => entry.descriptor.path === descriptor.path)?.file ?? null;
}

export const dependencyReviewAnalyzer: Analyzer = {
  id: DEPENDENCY_REVIEW_ANALYZER_ID,
  async analyze(context): Promise<AnalyzerResult> {
    const startedAt = new Date();
    const entries = context.patch.files
      .map((file) => ({ file, descriptor: describeDependencyFile(file.path) }))
      .filter(
        (entry): entry is { file: FileChange; descriptor: DependencyDescriptor } =>
          entry.descriptor !== null,
      );
    const descriptors = entries.map((entry) => entry.descriptor);
    const findings = [];

    for (const { file, descriptor } of entries) {
      const path = descriptor.path;
      if (file.kind === "deleted") {
        findings.push(
          makeFinding({
            ruleId: "dependency-review.file-deleted",
            title: `${descriptor.kind === "manifest" ? "Dependency manifest" : "Lockfile"} deleted`,
            description: `The patch deletes ${path}, removing ${descriptor.ecosystem} dependency provenance.`,
            severity: "warning",
            relatedFiles: changedPaths(file),
            fingerprintParts: [path, descriptor.kind, descriptor.ecosystem],
            location: { path },
            remediation: "Restore the file or document why dependency resolution no longer requires it.",
          }),
        );
        continue;
      }

      findings.push(
        makeFinding({
          ruleId: `dependency-review.${descriptor.kind}-changed`,
          title: `${descriptor.kind === "manifest" ? "Dependency manifest" : "Lockfile"} changed`,
          description: `${path} changes the resolved or declared ${descriptor.ecosystem} dependency surface and requires review.`,
          severity: "info",
          relatedFiles: [path],
          fingerprintParts: [path, file.kind, descriptor.ecosystem],
          location: { path },
        }),
      );

      if (descriptor.ecosystem === "node" && descriptor.kind === "manifest") {
        const basePath = normalizePath(file.previousPath ?? file.path);
        const [beforeValue, afterValue] = await Promise.all([
          safeGetFile(context, context.patch.baseCommit, basePath),
          safeGetFile(context, context.patch.headCommit, path),
        ]);
        const before = parseJsonObject(beforeValue);
        const after = parseJsonObject(afterValue);
        const changes = packageDependencyChanges(before, after);
        if (changes.length > 0) {
          const packageNames = changes.map((change) => change.name);
          findings.push(
            makeFinding({
              ruleId: "dependency-review.packages-added-or-updated",
              title: "Packages added or updated",
              description: `${path} adds or updates ${changes.length} package${changes.length === 1 ? "" : "s"}: ${packageNames.join(", ")}.`,
              severity: "warning",
              relatedFiles: [path],
              fingerprintParts: [path, ...changes.flatMap((change) => [change.name, change.value])],
              location: { path },
              remediation: "Confirm each package, source, version range, license, and transitive dependency change is intended.",
            }),
          );
        }

        const remotePackages = changes.filter((change) => remoteOrLocalSource(change.value));
        if (remotePackages.length > 0) {
          const packageNames = remotePackages.map((change) => change.name);
          findings.push(
            makeFinding({
              ruleId: "dependency-review.non-registry-source",
              title: "Non-registry package source added",
              description: `${path} points ${packageNames.join(", ")} at a URL, VCS repository, or local path.`,
              severity: "warning",
              relatedFiles: [path],
              fingerprintParts: [path, ...remotePackages.flatMap((change) => [change.name, change.value])],
              location: { path },
              remediation: "Pin an immutable, reviewed source and confirm that no credentials are embedded in its locator.",
            }),
          );
        }

        const hooks = addedInstallHooks(before, after);
        if (hooks.length > 0) {
          findings.push(
            makeFinding({
              ruleId: "dependency-review.install-hook",
              title: "Package installation hook added or changed",
              description: `${path} adds or changes the lifecycle hook${hooks.length === 1 ? "" : "s"} ${hooks.join(", ")}.`,
              severity: "warning",
              relatedFiles: [path],
              fingerprintParts: [path, ...hooks],
              location: { path },
              remediation: "Review the lifecycle command as executable supply-chain code and remove it if it is unnecessary.",
            }),
          );
        }
      }
    }

    for (const manifest of descriptors.filter((descriptor) => descriptor.kind === "manifest")) {
      if (manifest.expectedPeers.length === 0) {
        continue;
      }
      const existingLocks = await existingExpectedLocks(context, manifest);
      if (existingLocks.length === 0) {
        continue;
      }
      const lockChanged = descriptors.some(
        (candidate) =>
          candidate.kind === "lockfile" &&
          candidate.ecosystem === manifest.ecosystem &&
          existingLocks.includes(candidate.path),
      );
      if (!lockChanged) {
        const manifestFile = fileForDescriptor(manifest, entries);
        findings.push(
          makeFinding({
            ruleId: "dependency-review.lockfile-not-updated",
            title: "Manifest changed without its existing lockfile",
            description: `${manifest.path} changed, but the repository's corresponding lockfile did not.`,
            severity: "warning",
            relatedFiles: [manifest.path, ...existingLocks],
            fingerprintParts: [manifest.path, ...existingLocks],
            location: { path: manifest.path },
            remediation: "Regenerate the lockfile with the repository's package manager and include the resulting change.",
          }),
        );
        if (manifestFile === null) {
          continue;
        }
      }
    }

    for (const lock of descriptors.filter((descriptor) => descriptor.kind === "lockfile")) {
      if (!companionManifestChanged(lock, descriptors)) {
        findings.push(
          makeFinding({
            ruleId: "dependency-review.lockfile-only",
            title: "Lockfile changed without a dependency manifest",
            description: `${lock.path} changes resolved dependencies without a corresponding ${lock.ecosystem} manifest change.`,
            severity: "warning",
            relatedFiles: [lock.path],
            fingerprintParts: [lock.path, lock.ecosystem],
            location: { path: lock.path },
            remediation: "Confirm the lockfile was regenerated intentionally and inspect the resolved package changes.",
          }),
        );
      }
    }

    sortFindings(findings);
    const relatedFiles = uniqueSortedPaths(entries.flatMap(({ file }) => changedPaths(file)));
    return {
      findings,
      evidence: [
        makeEvidence({
          analyzerId: DEPENDENCY_REVIEW_ANALYZER_ID,
          patch: context.patch,
          status: evidenceStatusForFindings(findings),
          startedAt,
          summary:
            entries.length === 0
              ? "No dependency manifests or lockfiles changed."
              : `${entries.length} dependency file change${entries.length === 1 ? "" : "s"} reviewed with ${findings.filter((finding) => finding.severity !== "info").length} issue${findings.filter((finding) => finding.severity !== "info").length === 1 ? "" : "s"}.`,
          relatedFiles,
          metadata: {
            manifestsChanged: descriptors.filter((descriptor) => descriptor.kind === "manifest").length,
            lockfilesChanged: descriptors.filter((descriptor) => descriptor.kind === "lockfile").length,
            ecosystems: [...new Set(descriptors.map((descriptor) => descriptor.ecosystem))].sort(),
          },
        }),
      ],
    };
  },
};
