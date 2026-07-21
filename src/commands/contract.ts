import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pc from "picocolors";
import { ModelPolicySchema } from "../config/schemas.js";
import { createContractModel } from "../model/index.js";
import type { ModelPolicy } from "../types.js";
import { contractYaml } from "./templates.js";

export interface ContractCommandOptions {
  cwd: string;
  task?: string;
  taskFile?: string;
  repositorySummary?: string;
  provider: ModelPolicy["provider"];
  model?: string;
  endpoint?: string;
  apiKeyEnv?: string;
  output: string;
}

export async function generateContract(options: ContractCommandOptions): Promise<void> {
  if (options.provider === "none") {
    throw new Error("Choose --provider ollama or --provider openai-compatible.");
  }
  if (!options.task && !options.taskFile) {
    throw new Error("Provide --task or --task-file.");
  }
  if (options.task && options.taskFile) {
    throw new Error("Use either --task or --task-file, not both.");
  }
  const task = options.task ?? (await readFile(resolve(options.cwd, options.taskFile as string), "utf8"));
  const policy = ModelPolicySchema.parse({
    provider: options.provider,
    ...(options.model ? { model: options.model } : {}),
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    ...(options.apiKeyEnv ? { apiKeyEnv: options.apiKeyEnv } : {}),
  }) as ModelPolicy;
  const model = createContractModel(policy);
  const contract = await model.generateContract({
    task,
    provider: policy,
    ...(options.repositorySummary ? { repositorySummary: options.repositorySummary } : {}),
  });
  const outputPath = resolve(options.cwd, options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contractYaml(contract), "utf8");
  process.stdout.write(`${pc.green("Contract generated")} ${outputPath} via ${model.name}\n`);
}
