import type { ContractModel, ModelContractRequest, PatchContract } from "../types.js";
import { contractSchema } from "../config/schemas.js";
import { contractSystemPrompt, contractUserPrompt, extractJsonObject } from "./prompt.js";

interface OllamaResponse {
  message?: { content?: string };
  error?: string;
}

export class OllamaContractModel implements ContractModel {
  readonly name = "ollama";

  async generateContract(request: ModelContractRequest): Promise<PatchContract> {
    const model = request.provider.model?.trim();
    if (!model) throw new Error("An Ollama model name is required to generate a contract.");
    const endpoint = (request.provider.endpoint ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    const response = await fetch(`${endpoint}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: contractSystemPrompt() },
          { role: "user", content: contractUserPrompt(request) },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const payload = (await response.json()) as OllamaResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? `Ollama returned HTTP ${response.status}.`);
    }
    const content = payload.message?.content;
    if (!content) throw new Error("Ollama returned an empty contract response.");
    return contractSchema.parse(extractJsonObject(content));
  }
}
