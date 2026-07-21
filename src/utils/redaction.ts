export const REDACTION_MARKER = "[REDACTED]";

export interface RedactionOptions {
  /** Exact secret values to remove. Values shorter than four characters are ignored. */
  secrets?: readonly string[];
  /** Additional regular expressions. Every complete match is replaced. */
  patterns?: readonly RegExp[];
  marker?: string;
}

const BUILT_IN_PATTERNS: readonly RegExp[] = [
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.:-]{8,}\b/giu,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']?[^\s,"';]{4,}["']?/giu,
  /(?<=:\/\/)[^\s/:@]+:[^\s/@]+(?=@)/gu,
] as const;

export function redactSecrets(
  input: string,
  secretsOrOptions: readonly string[] | RedactionOptions = [],
): string {
  const options: RedactionOptions = Array.isArray(secretsOrOptions)
    ? { secrets: secretsOrOptions }
    : (secretsOrOptions as RedactionOptions);
  const marker = options.marker ?? REDACTION_MARKER;
  let result = input;

  const secrets = [...new Set(options.secrets ?? [])]
    .filter((secret) => secret.length >= 4)
    .sort((left, right) => right.length - left.length);

  for (const secret of secrets) {
    result = result.replaceAll(secret, marker);
  }

  for (const pattern of [...BUILT_IN_PATTERNS, ...(options.patterns ?? [])]) {
    result = replaceAllMatches(result, pattern, marker);
  }

  return result;
}

export const redact = redactSecrets;

export function createRedactor(options: RedactionOptions = {}): (input: string) => string {
  return (input) => redactSecrets(input, options);
}

export function secretValuesFromEnvironment(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string[] {
  const secretName = /(?:api[_-]?key|auth|credential|password|passwd|private[_-]?key|secret|token)/iu;
  return Object.entries(environment)
    .filter(([name, value]) => secretName.test(name) && typeof value === "string" && value.length >= 4)
    .map(([, value]) => value as string);
}

function replaceAllMatches(input: string, pattern: RegExp, marker: string): string {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  return input.replace(globalPattern, marker);
}
