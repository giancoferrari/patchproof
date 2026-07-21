import type { ZodIssue } from "zod";

export interface ConfigIssue {
  path: string;
  message: string;
  code?: string;
}

export class ConfigValidationError extends Error {
  readonly source: string;
  readonly issues: readonly ConfigIssue[];

  constructor(kind: "policy" | "contract", source: string, issues: readonly ConfigIssue[]) {
    const summary = issues
      .map((issue) => `  - ${issue.path}: ${issue.message}`)
      .join("\n");
    super(`Invalid PatchProof ${kind} in ${source}:\n${summary}`);
    this.name = "ConfigValidationError";
    this.source = source;
    this.issues = issues;
  }
}

export class ConfigSourceError extends Error {
  readonly source: string;

  constructor(message: string, source: string, options?: ErrorOptions) {
    super(`${message}: ${source}`, options);
    this.name = "ConfigSourceError";
    this.source = source;
  }
}

export function zodIssues(issues: readonly ZodIssue[]): ConfigIssue[] {
  return issues.map((issue) => ({
    path: renderPath(issue.path),
    message: issue.message,
    code: issue.code,
  }));
}

export function renderPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "$";

  let rendered = "$";
  for (const part of path) {
    if (typeof part === "number") {
      rendered += `[${part}]`;
    } else if (typeof part === "symbol") {
      rendered += `[${JSON.stringify(part.description ?? "symbol")}]`;
    } else if (/^[A-Za-z_$][\w$]*$/u.test(part)) {
      rendered += `.${part}`;
    } else {
      rendered += `[${JSON.stringify(part)}]`;
    }
  }
  return rendered;
}
