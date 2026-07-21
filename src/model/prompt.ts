import type { ModelContractRequest } from "../types.js";

export function contractSystemPrompt(): string {
  return [
    "You draft verification contracts for software patches.",
    "Return one JSON object and no prose.",
    "Every claim must be falsifiable and must name deterministic evidence requirements.",
    "Allowed evidence keys are commands, rules, paths, and requireTestChange.",
    "Allowed severities are blocking, warning, and info.",
    "Do not claim that an LLM judgment is proof.",
    "Use this exact top-level shape: {version:1,id,title,task,claims,outOfScope}.",
  ].join(" ");
}

export function contractUserPrompt(request: ModelContractRequest): string {
  const context = request.repositorySummary?.trim();
  return [
    "Task to convert into a PatchProof contract:",
    request.task.trim(),
    context ? `\nRepository context:\n${context}` : "",
    "\nDraft between 2 and 8 claims. Use stable lowercase kebab-case identifiers.",
    "A claim that changes behavior should normally require a test change and at least one command.",
    "Use built-in rule identifiers where relevant: policy-integrity, test-integrity, secret-scan, scope, dependency-review, diff-size.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("The model response did not contain a JSON object.");
    }
    return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
  }
}
