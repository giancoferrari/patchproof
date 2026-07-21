import type { ContractModel, ModelContractRequest, PatchContract } from "../types.js";
import { contractSchema } from "../config/schemas.js";
import { contractSystemPrompt, contractUserPrompt, extractJsonObject } from "./prompt.js";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

function completionUrl(endpoint: string): string {
  const trimmed = endpoint.replace(/\/$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return trimmed.endsWith("/v1")
    ? `${trimmed}/chat/completions`
    : `${trimmed}/v1/chat/completions`;
}

export class OpenAICompatibleContractModel implements ContractModel {
  readonly name = "openai-compatible";

  async generateContract(request: ModelContractRequest): Promise<PatchContract> {
    const model = request.provider.model?.trim();
    const endpoint = request.provider.endpoint?.trim();
    if (!model) throw new Error("A model name is required for the OpenAI-compatible provider.");
    if (!endpoint) throw new Error("An endpoint is required for the OpenAI-compatible provider.");

    const headers: Record<string, string> = { "content-type": "application/json" };
    const keyEnv = request.provider.apiKeyEnv?.trim();
    if (keyEnv) {
      const key = process.env[keyEnv];
      if (!key) throw new Error(`Environment variable ${keyEnv} is not set.`);
      headers["authorization"] = `Bearer ${key}`;
    }

    const response = await fetch(completionUrl(endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: contractSystemPrompt() },
          { role: "user", content: contractUserPrompt(request) },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const payload = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Model endpoint returned HTTP ${response.status}.`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("The model endpoint returned an empty contract response.");
    return contractSchema.parse(extractJsonObject(content));
  }
}
