# Local models and contract drafting

Models are optional in PatchProof. They draft claim contracts; they never inspect evidence, run analyzers, or decide a verdict. `patchproof verify` is deterministic and makes no model request.

## Ollama: local default

PatchProof sends one non-streaming `/api/chat` request to Ollama, requests JSON output, uses temperature `0`, and applies a 120-second timeout. The default endpoint is `http://127.0.0.1:11434`.

With Ollama installed, pull and start a coding model:

```sh
ollama pull qwen2.5-coder:7b
ollama serve
```

In another shell, generate the contract:

```sh
patchproof contract \
  --provider ollama \
  --model qwen2.5-coder:7b \
  --task "Add optimistic concurrency control to invoice updates and reject stale version numbers" \
  --repository-summary "TypeScript API; npm test runs Vitest; handlers are under src/api; tests are under tests" \
  --output .patchproof/contract.yml
patchproof doctor
```

To use another Ollama host explicitly:

```sh
patchproof contract \
  --provider ollama \
  --model qwen2.5-coder:7b \
  --endpoint http://127.0.0.1:11434 \
  --task-file task.md \
  --output .patchproof/contract.yml
```

`--task-file task.md` reads the complete file and sends it as task text. The model must already exist in Ollama; PatchProof does not download models.

## OpenAI-compatible endpoints

Use this adapter for a local server or an intentionally selected remote service that implements chat completions:

```sh
patchproof contract \
  --provider openai-compatible \
  --model local-coder \
  --endpoint http://127.0.0.1:8000 \
  --task "Make webhook delivery idempotent across retries" \
  --repository-summary "Python service; pytest is the required test command" \
  --output .patchproof/contract.yml
```

If the endpoint already ends in `/chat/completions`, PatchProof uses it unchanged. An endpoint ending in `/v1` receives `/chat/completions`; every other base receives `/v1/chat/completions`. PatchProof sends temperature `0`, requests a JSON object through `response_format`, and times out after 120 seconds.

For an endpoint requiring bearer authentication, name the environment variable rather than placing a key in command history:

PowerShell:

```powershell
$env:PATCHPROOF_MODEL_KEY = "local-development-key"
patchproof contract `
  --provider openai-compatible `
  --model contract-drafter `
  --endpoint http://127.0.0.1:8000/v1 `
  --api-key-env PATCHPROOF_MODEL_KEY `
  --task "Require audit entries for every role change" `
  --output .patchproof/contract.yml
```

This example assumes your loopback endpoint accepts `local-development-key` and serves `contract-drafter`. PatchProof does not discover or provision the endpoint.

## Exact data boundary

The request contains:

- PatchProof's contract-writing system instruction;
- the complete `--task` text, or complete contents of `--task-file`;
- `--repository-summary` when supplied;
- model name and generation settings required by the endpoint.

PatchProof does not automatically send repository files, the Git diff, existing policy, existing contract, command output, environment variables, or proof bundles. For authenticated OpenAI-compatible requests, only the selected environment variable is added as an HTTP bearer token.

Task text and repository summaries are not redacted. Do not include secrets, credentials, proprietary code, personal data, or incident details unless the endpoint is authorized to receive them.

## Validation and review

The model response may be raw JSON or a JSON object inside a Markdown JSON fence. PatchProof extracts the object, validates it against the same strict contract schema used during verification, and writes normalized YAML only after validation succeeds.

Validation guarantees shape, limits, identifier syntax, and claim presence. Cross-document references are checked later by `patchproof doctor` or `patchproof verify`, because the standalone contract command does not load policy. It cannot guarantee that claims are meaningful.

Review every generated contract for:

1. falsifiable statements rather than broad quality claims;
2. command IDs that exist in policy;
3. enabled built-in rule IDs;
4. behavior changes that require tests;
5. task-specific `outOfScope` exclusions;
6. accidental omission of security, migration, compatibility, or failure-path requirements.

Commit or externally record the reviewed contract before implementation when your workflow requires evidence that intent was fixed in advance.

## Policy model configuration

The policy schema accepts:

```yaml
model:
  provider: ollama
  model: qwen2.5-coder:7b
  endpoint: http://127.0.0.1:11434
```

In `0.1.0`, the `contract` CLI builds its provider configuration from command-line options and does not read these policy values. Verification also ignores the model block. Treat it as validated configuration for programmatic consumers and future integration, not as a CLI default.

For `provider: none`, `model`, `endpoint`, and `apiKeyEnv` are forbidden. OpenAI-compatible configuration requires both `model` and `endpoint`. The contract CLI applies this same model schema before sending a request. When `apiKeyEnv` is configured, it rejects plaintext HTTP except for `localhost`, `127.0.0.1`, and `[::1]` loopback endpoints.

## Failure modes

| Failure | Result |
| --- | --- |
| Ollama model missing | Endpoint error; no contract is written |
| Endpoint unreachable or exceeds 120 seconds | Contract command fails |
| API-key environment variable absent | Request is not sent |
| Empty model response | Contract command fails |
| Invalid or non-JSON response | Parsing fails; no contract is written |
| Unknown command or disabled rule reference | Later `doctor`/`verify` validation fails |
| Well-formed but weak claims | Human review must reject or revise them |

Model availability is convenience, not a prerequisite. A hand-authored YAML contract receives exactly the same verification treatment.
