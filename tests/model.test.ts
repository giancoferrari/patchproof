import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaContractModel } from "../src/model/ollama.js";
import { OpenAICompatibleContractModel } from "../src/model/openai-compatible.js";
import { extractJsonObject } from "../src/model/prompt.js";

const contract = {
  version: 1,
  id: "generated-contract",
  title: "Generated contract",
  task: "Fix the bug",
  claims: [
    {
      id: "behavior",
      statement: "The bug is covered by passing tests.",
      severity: "blocking",
      evidence: { commands: ["tests"], requireTestChange: true },
    },
  ],
  outOfScope: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["PATCHPROOF_TEST_KEY"];
});

describe("model contract adapters", () => {
  it("extracts JSON from a fenced model response", () => {
    expect(extractJsonObject(`\`\`\`json\n${JSON.stringify(contract)}\n\`\`\``)).toEqual(contract);
  });

  it("generates a validated contract through Ollama", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ message: { content: JSON.stringify(contract) } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const model = new OllamaContractModel();
    const result = await model.generateContract({
      task: "Fix the bug",
      provider: { provider: "ollama", model: "qwen-coder", endpoint: "http://127.0.0.1:11434" },
    });
    expect(result.id).toBe("generated-contract");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://127.0.0.1:11434/api/chat");
  });

  it("uses an environment key without putting it in the request body", async () => {
    process.env["PATCHPROOF_TEST_KEY"] = "top-secret-test-key";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["authorization"]).toBe("Bearer top-secret-test-key");
      expect(String(init?.body)).not.toContain("top-secret-test-key");
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(contract) } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const model = new OpenAICompatibleContractModel();
    await model.generateContract({
      task: "Fix the bug",
      provider: {
        provider: "openai-compatible",
        model: "coder",
        endpoint: "https://models.example.test",
        apiKeyEnv: "PATCHPROOF_TEST_KEY",
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects model output that does not satisfy the contract schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: { content: '{"title":"missing claims"}' } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      new OllamaContractModel().generateContract({
        task: "Fix the bug",
        provider: { provider: "ollama", model: "qwen-coder" },
      }),
    ).rejects.toThrow();
  });
});
