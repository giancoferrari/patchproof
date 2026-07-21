import { z } from "zod";
import { DEFAULT_COMMAND_TIMEOUT_MS } from "../constants.js";
import type { PatchContract, PatchProofPolicy } from "../types.js";

const identifier = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .max(100, "must be 100 characters or fewer")
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u, "must use letters, numbers, dots, underscores, or hyphens");

const repositoryRelativePath = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .refine((value) => !/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(value), {
    message: "must be relative to the repository",
  })
  .refine(
    (value) =>
      !value
        .replace(/\\/gu, "/")
        .split("/")
        .some((segment) => segment === ".."),
    { message: "must not escape the repository with '..'" },
  );

const globPattern = z
  .string()
  .trim()
  .min(1, "glob must not be empty")
  .max(500, "glob must be 500 characters or fewer")
  .refine((value) => !value.includes("\0"), "glob must not contain NUL bytes");

export const CommandSpecSchema = z
  .object({
    id: identifier,
    run: z.string().trim().min(1, "command must not be empty").max(16_384),
    description: z.string().trim().min(1).max(500).optional(),
    timeoutMs: z
      .number()
      .int()
      .min(100, "timeout must be at least 100ms")
      .max(3_600_000, "timeout cannot exceed one hour")
      .default(DEFAULT_COMMAND_TIMEOUT_MS),
    required: z.boolean().default(true),
    cwd: repositoryRelativePath.optional(),
    env: z
      .record(
        z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "invalid environment variable name"),
        z.string().max(32_768),
      )
      .optional(),
    inheritEnv: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "invalid environment variable name"),
      )
      .max(100)
      .refine((names) => new Set(names).size === names.length, "must not contain duplicates")
      .optional(),
  })
  .strict();

export const ScopePolicySchema = z
  .object({
    allowed: z.array(globPattern).max(1_000).default(["**/*"]),
    denied: z.array(globPattern).max(1_000).default([]),
  })
  .strict()
  .default({ allowed: ["**/*"], denied: [] });

export const ThresholdPolicySchema = z
  .object({
    maxChangedFiles: z.number().int().positive().max(1_000_000).default(100),
    maxChangedLines: z.number().int().positive().max(100_000_000).default(2_000),
    requireTestsForSourceChanges: z.boolean().default(true),
  })
  .strict()
  .default({
    maxChangedFiles: 100,
    maxChangedLines: 2_000,
    requireTestsForSourceChanges: true,
  });

const enabledByDefault = z.boolean().default(true);

export const RulePolicySchema = z
  .object({
    policyIntegrity: enabledByDefault,
    testIntegrity: enabledByDefault,
    secretScan: enabledByDefault,
    dependencyReview: enabledByDefault,
    scope: enabledByDefault,
    diffSize: enabledByDefault,
  })
  .strict()
  .default({
    policyIntegrity: true,
    testIntegrity: true,
    secretScan: true,
    dependencyReview: true,
    scope: true,
    diffSize: true,
  });

export const ModelPolicySchema = z
  .object({
    provider: z.enum(["none", "ollama", "openai-compatible"]).default("none"),
    model: z.string().trim().min(1).max(300).optional(),
    endpoint: z.url().refine((url) => /^https?:/u.test(url), "must use http or https").optional(),
    apiKeyEnv: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "must be an environment variable name")
      .optional(),
  })
  .strict()
  .superRefine((model, context) => {
    if (model.provider === "none" && (model.model || model.endpoint || model.apiKeyEnv)) {
      context.addIssue({
        code: "custom",
        message: "model, endpoint, and apiKeyEnv are not valid when provider is 'none'",
      });
    }
    if (model.provider === "openai-compatible" && !model.model) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "is required for an openai-compatible provider",
      });
    }
    if (model.provider === "openai-compatible" && !model.endpoint) {
      context.addIssue({
        code: "custom",
        path: ["endpoint"],
        message: "is required for an openai-compatible provider",
      });
    }
    if (model.apiKeyEnv && model.endpoint) {
      const url = new URL(model.endpoint);
      const loopback =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]";
      if (url.protocol !== "https:" && !loopback) {
        context.addIssue({
          code: "custom",
          path: ["endpoint"],
          message: "must use HTTPS when apiKeyEnv is configured, except for loopback endpoints",
        });
      }
    }
  })
  .default({ provider: "none" });

export const PatchProofPolicySchema = z
  .object({
    version: z.literal(1).default(1),
    commands: z.array(CommandSpecSchema).max(500).default([]),
    scope: ScopePolicySchema,
    thresholds: ThresholdPolicySchema,
    rules: RulePolicySchema,
    model: ModelPolicySchema,
    redactions: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "must be an environment variable name"),
      )
      .max(500)
      .refine((names) => new Set(names).size === names.length, "must not contain duplicates")
      .default([]),
  })
  .strict()
  .superRefine((policy, context) => {
    addDuplicateIssues(
      policy.commands.map((command) => command.id),
      "commands",
      context,
    );
  });

export const ClaimEvidenceRequirementSchema = z
  .object({
    commands: z.array(identifier).max(500).optional(),
    rules: z.array(identifier).max(500).optional(),
    paths: z.array(globPattern).max(1_000).optional(),
    requireTestChange: z.boolean().optional(),
  })
  .strict()
  .default({});

export const ClaimDefinitionSchema = z
  .object({
    id: identifier,
    statement: z.string().trim().min(1).max(4_000),
    severity: z.enum(["info", "warning", "blocking"]).default("blocking"),
    evidence: ClaimEvidenceRequirementSchema,
  })
  .strict();

export const PatchContractSchema = z
  .object({
    version: z.literal(1).default(1),
    id: identifier,
    title: z.string().trim().min(1).max(500),
    task: z.string().trim().min(1).max(50_000).optional(),
    claims: z.array(ClaimDefinitionSchema).min(1, "must contain at least one falsifiable claim").max(1_000),
    outOfScope: z.array(z.string().trim().min(1).max(2_000)).max(1_000).default([]),
  })
  .strict()
  .superRefine((contract, context) => {
    addDuplicateIssues(
      contract.claims.map((claim) => claim.id),
      "claims",
      context,
    );
  });

// Concise aliases used by model adapters and public API consumers.
export const policySchema = PatchProofPolicySchema as z.ZodType<PatchProofPolicy>;
export const contractSchema = PatchContractSchema as z.ZodType<PatchContract>;

function addDuplicateIssues(
  ids: readonly string[],
  collection: "commands" | "claims",
  context: z.RefinementCtx,
): void {
  const firstIndex = new Map<string, number>();
  ids.forEach((id, index) => {
    const previous = firstIndex.get(id);
    if (previous === undefined) {
      firstIndex.set(id, index);
      return;
    }
    context.addIssue({
      code: "custom",
      path: [collection, index, "id"],
      message: `duplicates ${collection}[${previous}].id ('${id}')`,
    });
  });
}
