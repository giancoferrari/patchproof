import { minimatch, type MinimatchOptions } from "minimatch";

const GLOB_OPTIONS: MinimatchOptions = {
  dot: true,
  matchBase: false,
  nocase: process.platform === "win32",
  nonegate: true,
  noext: false,
};

export function normalizeRepositoryPath(path: string): string {
  return path
    .replace(/\\/gu, "/")
    .replace(/^\.\//u, "")
    .replace(/\/{2,}/gu, "/");
}

export function matchesGlob(path: string, pattern: string): boolean {
  const normalizedPath = normalizeRepositoryPath(path);
  const normalizedPattern = normalizeRepositoryPath(pattern);
  return minimatch(normalizedPath, normalizedPattern, GLOB_OPTIONS);
}

export function matchesAnyGlob(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(path, pattern));
}

export function matchesAllGlobs(path: string, patterns: readonly string[]): boolean {
  return patterns.every((pattern) => matchesGlob(path, pattern));
}

export function filterByGlobs(
  paths: readonly string[],
  include: readonly string[] = ["**/*"],
  exclude: readonly string[] = [],
): string[] {
  return paths.filter(
    (path) => matchesAnyGlob(path, include) && !matchesAnyGlob(path, exclude),
  );
}

const TEST_FILE_PATTERNS = [
  "**/__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/test_*.py",
  "**/*_test.{py,go,rs,rb}",
  "**/*Tests.{cs,fs}",
] as const;

export function isTestPath(path: string): boolean {
  return matchesAnyGlob(path, TEST_FILE_PATTERNS);
}
