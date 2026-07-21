import type { ContractModel, ModelPolicy } from "../types.js";
import { OllamaContractModel } from "./ollama.js";
import { OpenAICompatibleContractModel } from "./openai-compatible.js";

export * from "./ollama.js";
export * from "./openai-compatible.js";
export * from "./prompt.js";

export function createContractModel(policy: ModelPolicy): ContractModel {
  if (policy.provider === "ollama") return new OllamaContractModel();
  if (policy.provider === "openai-compatible") return new OpenAICompatibleContractModel();
  throw new Error("Contract generation is disabled. Set model.provider to ollama or openai-compatible.");
}
