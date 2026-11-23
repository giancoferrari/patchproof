import type { AnalyzerContext, CommandSpec, FileChange, Finding } from "../types.js";
import { changedPaths, makeFinding, normalizePath } from "./utils.js";

/**
 * Policy commands come from the trusted base commit, but package-manager commands such as
 * `npm test` execute whatever the candidate's package.json says. A patch that rewrites the
 * script a policy command runs can make a broken change pass, so those edits are blocking.
 */

const SEGMENT_SEPARATOR = /&&|\|\||[;|\n]/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const DIRECTORY_FLAGS = new Set(["--prefix", "-C", "--dir", "--cwd"]);
const VALUE_FLAGS = new Set(["--filter", "-F", "--workspace", "-w", "--loglevel"]);

const BUILTIN_VERBS: Record<"pnpm" | "yarn" | "bun", ReadonlySet<string>> = {
  pnpm: new Set([
    "add", "audit", "config", "create", "dedupe", "deploy", "dlx", "doctor", "env", "exec", "fetch",
    "i", "import", "init", "install", "link", "list", "ls", "outdated", "pack", "patch", "prune",
    "publish", "rebuild", "remove", "rm", "setup", "store", "unlink", "up", "update", "why",
  ]),
  yarn: new Set([
    "add", "bin", "cache", "config", "constraints", "create", "dlx", "exec", "info", "init", "install",
    "link", "list", "node", "npm", "pack", "patch", "plugin", "publish", "remove", "set", "unlink",
    "up", "upgrade", "version", "why", "workspace", "workspaces",
  ]),
  bun: new Set([
    "add", "build", "create", "exec", "init", "install", "link", "outdated", "pm", "publish", "remove",
    "test", "update", "upgrade", "x",
  ]),
};

interface ScriptReference {
  name: string;
  directory: string;
}

/** Package scripts a shell command runs, e.g. `npm test` -> test, `pnpm run lint` -> lint. */
export function scriptReferences(command: string, directory = ""): ScriptReference[] {
  const references: ScriptReference[] = [];
  for (const segment of command.split(SEGMENT_SEPARATOR)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    let index = 0;
    while (index < tokens.length && ENV_ASSIGNMENT.test(tokens[index]!)) index += 1;
    const tool = tokens[index]?.replace(/\.(?:cmd|exe|ps1)$/i, "").toLowerCase();
    if (tool !== "npm" && tool !== "pnpm" && tool !== "yarn" && tool !== "bun") continue;

    let target = directory;
    const words: string[] = [];
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor]!;
      if (token === "--") break;
      if (DIRECTORY_FLAGS.has(token)) {
        target = joinDirectory(directory, tokens[cursor + 1] ?? "");
        cursor += 1;
      } else if (VALUE_FLAGS.has(token)) {
        cursor += 1;
      } else if (!token.startsWith("-")) {
        words.push(token);
      }
    }
    const [verb, name] = words;
    if (verb === undefined) continue;

    let script: string | undefined;
    if (tool === "npm") {
      if (verb === "test" || verb === "t" || verb === "tst") script = "test";
      else if (verb === "start" || verb === "stop" || verb === "restart") script = verb;
      else if (verb === "run" || verb === "run-script" || verb === "rum" || verb === "urn") script = name;
    } else if (verb === "run") {
      script = name;
    } else if (!BUILTIN_VERBS[tool].has(verb)) {
      script = verb;
    }
    if (script !== undefined) references.push({ name: script, directory: target });
  }
  return references;
}

function joinDirectory(base: string, relative: string): string {
  const joined = normalizePath([base, relative].filter(Boolean).join("/"));
  return joined.replace(/^\.\/?/, "").replace(/\/$/, "");
}

function manifestPath(directory: string): string {
  return directory ? `${directory}/package.json` : "package.json";
}

function readScripts(source: string | null): Record<string, string> | null {
  if (source === null) return {};
  try {
    const parsed: unknown = JSON.parse(source);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (scripts === undefined) return {};
    if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) return null;
    return Object.fromEntries(
      Object.entries(scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return null;
  }
}

/** Script names a set of entry scripts can reach at the base revision, including npm pre/post hooks. */
function reachableScripts(entries: readonly string[], scripts: Record<string, string>): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const name = queue.shift()!;
    for (const candidate of [`pre${name}`, name, `post${name}`]) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      const body = scripts[candidate];
      if (body === undefined) continue;
      for (const reference of scriptReferences(body)) queue.push(reference.name);
    }
  }
  return [...seen].sort();
}

const TEST_CONFIGS: ReadonlyArray<{ tool: RegExp; file: RegExp; label: string }> = [
  { tool: /\bvitest\b/, file: /(?:^|\/)(?:vitest|vite)\.(?:config|workspace)\.[cm]?[jt]s$|(?:^|\/)vitest\.workspace\.json$/, label: "Vitest" },
  { tool: /\bjest\b/, file: /(?:^|\/)jest\.config\.(?:[cm]?[jt]s|json)$/, label: "Jest" },
  { tool: /\bplaywright\b/, file: /(?:^|\/)playwright\.config\.[cm]?[jt]s$/, label: "Playwright" },
  { tool: /\bcypress\b/, file: /(?:^|\/)cypress\.config\.[cm]?[jt]s$/, label: "Cypress" },
  { tool: /\bmocha\b/, file: /(?:^|\/)\.mocharc\.(?:c?js|jsonc?|ya?ml)$/, label: "Mocha" },
  { tool: /\bkarma\b/, file: /(?:^|\/)karma\.conf\.[cm]?[jt]s$/, label: "Karma" },
  { tool: /\b(?:pytest|py\.test|tox)\b/, file: /(?:^|\/)(?:pytest\.ini|tox\.ini|setup\.cfg|pyproject\.toml|conftest\.py)$/, label: "pytest" },
  { tool: /\btsc\b/, file: /(?:^|\/)tsconfig(?:\.[\w-]+)?\.json$/, label: "TypeScript" },
  { tool: /\beslint\b/, file: /(?:^|\/)(?:\.eslintrc(?:\.\w+)?|eslint\.config\.[cm]?[jt]s)$/, label: "ESLint" },
  { tool: /\bmake\b/, file: /(?:^|\/)(?:GNUmakefile|[Mm]akefile)$/, label: "Make" },
  { tool: /\bjust\b/, file: /(?:^|\/)[Jj]ustfile$/, label: "just" },
];

export interface CommandDefinitionReview {
  findings: Finding[];
  checkedScripts: string[];
  relatedFiles: string[];
}

export async function reviewCommandDefinitions(context: AnalyzerContext): Promise<CommandDefinitionReview> {
  const findings: Finding[] = [];
  const checkedScripts: string[] = [];
  const relatedFiles: string[] = [];
  const changed = new Map<string, FileChange>();
  for (const file of context.patch.files) {
    for (const path of changedPaths(file)) changed.set(normalizePath(path), file);
  }

  const entriesByManifest = new Map<string, { commands: CommandSpec[]; scripts: Set<string> }>();
  for (const command of context.policy.commands) {
    for (const reference of scriptReferences(command.run, joinDirectory("", command.cwd ?? ""))) {
      const path = manifestPath(reference.directory);
      const entry = entriesByManifest.get(path) ?? { commands: [], scripts: new Set<string>() };
      if (!entry.commands.includes(command)) entry.commands.push(command);
      entry.scripts.add(reference.name);
      entriesByManifest.set(path, entry);
    }
  }

  const commandText: string[] = context.policy.commands.map((command) => command.run);
  for (const [path, entry] of [...entriesByManifest.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    let baseSource: string | null = null;
    let headSource: string | null = null;
    let readFailed = false;
    try {
      [baseSource, headSource] = await Promise.all([
        context.getFileAtRef(context.patch.baseCommit, path),
        changed.has(path) ? context.getFileAtRef(context.patch.headCommit, path) : Promise.resolve(null),
      ]);
    } catch {
      readFailed = true;
    }
    const baseScripts = readScripts(baseSource) ?? {};
    const names = reachableScripts([...entry.scripts], baseScripts);
    checkedScripts.push(...names.filter((name) => baseScripts[name] !== undefined).map((name) => `${path}#${name}`));
    commandText.push(...names.map((name) => baseScripts[name] ?? ""));
    if (!changed.has(path)) continue;

    relatedFiles.push(path);
    const headScripts = readFailed ? null : readScripts(headSource);
    const commandIds = entry.commands.map((command) => command.id).join(", ");
    if (headScripts === null) {
      findings.push(
        makeFinding({
          ruleId: "policy-integrity.command-definition-unverified",
          title: "Verification command definitions could not be checked",
          description: `The patch changes ${path}, and PatchProof could not read the scripts that policy command ${commandIds} runs.`,
          severity: "blocking",
          relatedFiles: [path],
          fingerprintParts: [path, "unverified"],
          location: { path },
          remediation: "Keep package.json valid JSON and run verification again.",
        }),
      );
      continue;
    }

    const altered = reachableScripts([...entry.scripts], { ...baseScripts, ...headScripts }).filter(
      (name) => baseScripts[name] !== headScripts[name],
    );
    if (altered.length === 0) continue;
    const list = altered.map((name) => `"${name}"`).join(", ");
    findings.push(
      makeFinding({
        ruleId: "policy-integrity.command-definition-changed",
        title: "Verification command definition changed",
        description: `Policy command ${commandIds} runs package scripts from ${path}, and the patch changes ${list}. The trusted policy would execute the candidate's version of ${altered.length === 1 ? "that script" : "those scripts"}, so passing results no longer prove the original checks ran.`,
        severity: "blocking",
        relatedFiles: [path],
        fingerprintParts: [path, ...altered],
        location: { path },
        remediation: "Move script changes to a separately reviewed patch, or restore the base version of these scripts.",
      }),
    );
  }

  const text = commandText.join("\n");
  const configs = TEST_CONFIGS.filter((config) => config.tool.test(text));
  for (const path of [...changed.keys()].sort()) {
    const config = configs.find((candidate) => candidate.file.test(path));
    if (config === undefined) continue;
    relatedFiles.push(path);
    findings.push(
      makeFinding({
        ruleId: "policy-integrity.runner-config-changed",
        title: `${config.label} configuration changed`,
        description: `A policy command uses ${config.label}, and the patch changes ${path}. Configuration can exclude tests, lower thresholds, or relax checks while the command still passes.`,
        severity: "warning",
        relatedFiles: [path],
        fingerprintParts: [path, config.label],
        location: { path },
        remediation: "Confirm the configuration change keeps the same tests and checks active.",
      }),
    );
  }

  return { findings, checkedScripts: [...new Set(checkedScripts)].sort(), relatedFiles };
}
