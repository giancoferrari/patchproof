# Policies and contracts

PatchProof separates **how verification is allowed to run** from **what the patch claims to prove**:

- The policy defines trusted commands, scope, thresholds, analyzers, model defaults, and redactions.
- The contract defines falsifiable claims and their required evidence.

Both are strict YAML version `1`. JSON-compatible YAML is accepted. Unknown keys, duplicate map keys, duplicate IDs, invalid paths, and invalid cross-references fail closed.

## Trust lifecycle

The default locations are `.patchproof/policy.yml` and `.patchproof/contract.yml`.

On ordinary verification, the policy is read from the resolved base commit, so a candidate policy edit cannot relax the rules used for that run. With the default `policyIntegrity` analyzer enabled, changes to recognized `.patchproof/policy.*` paths are also blocking. `--trust-working-policy` instead reads the local file and labels the seal `explicit-file`; this is useful while authoring policy but is a weaker trust mode.

The contract is always read from the working tree and hashed into the bundle. When commands run, PatchProof requires the checkout to be clean and at the candidate head, binding the contract file to that commit. Review it before implementation; high-assurance workflows should preserve the approved contract digest outside candidate control.

## Complete policy example

This document is accepted by the current schema:

```yaml
version: 1
commands:
  - id: types
    run: npm run typecheck
    description: TypeScript type checking
    timeoutMs: 240000
    required: true
  - id: tests
    run: npm test
    description: Unit and integration tests
    timeoutMs: 300000
    required: true
  - id: build
    run: npm run build
    description: Production build
    timeoutMs: 600000
    required: false
scope:
  allowed:
    - src/**
    - tests/**
    - docs/**
    - .patchproof/contract.yml
    - "*.json"
    - "*.md"
  denied:
    - .git/**
    - .env*
    - .patchproof/keys/**
    - .github/workflows/**
thresholds:
  maxChangedFiles: 80
  maxChangedLines: 2000
  requireTestsForSourceChanges: true
rules:
  policyIntegrity: true
  testIntegrity: true
  secretScan: true
  dependencyReview: true
  scope: true
  diffSize: true
model:
  provider: none
redactions: []
```

Save it at `.patchproof/policy.yml` on the trusted base branch, then commit it:

```sh
git add .patchproof/policy.yml
git commit -m "chore: define PatchProof policy"
```

### Policy fields

| Field | Rules and defaults |
| --- | --- |
| `version` | Must be `1` |
| `commands` | Up to 500 unique command IDs; default `[]` |
| `scope.allowed` | Up to 1,000 globs; schema default `**/*` |
| `scope.denied` | Up to 1,000 globs; schema default `[]` |
| `thresholds.maxChangedFiles` | Positive integer, at most 1,000,000; schema default `100` |
| `thresholds.maxChangedLines` | Positive integer, at most 100,000,000; schema default `2000` |
| `thresholds.requireTestsForSourceChanges` | Boolean; default `true` |
| `rules` | Six booleans, each defaulting to `true` |
| `model` | `none`, `ollama`, or `openai-compatible`; default `none` |
| `redactions` | Up to 500 unique environment-variable names whose runtime values are redacted |

`patchproof init` uses intentionally narrower generated defaults than some schema defaults: 80 files, common source/test/doc paths plus `.patchproof/contract.yml`, protected Git/environment/key/workflow paths, and all analyzers enabled.

### Command fields

| Field | Meaning |
| --- | --- |
| `id` | 1-100 letters, digits, dots, underscores, or hyphens; first character alphanumeric |
| `run` | Nonempty shell command, at most 16,384 characters |
| `description` | Optional human label, at most 500 characters |
| `timeoutMs` | 100 to 3,600,000 ms; default 300,000 |
| `required` | Whether failure/incompleteness affects the verdict; default `true` |
| `cwd` | Optional repository-relative directory; absolute paths and `..` are rejected |
| `env` | Optional static string map; names and values are embedded in policy and proof |
| `inheritEnv` | Up to 100 unique host environment-variable names to expose to this command |

Commands execute in listed order through the platform shell. They receive a small safe baseline (path, OS, locale, terminal, temporary-directory, home, and CI variables), the host values explicitly named by `inheritEnv`, and static `env` entries. PatchProof resolves the command working directory through the filesystem and rejects a real path outside the repository. This is not a sandbox; treat policy command text and explicit environment grants as privileged code.

Command output is capped and redacted using the runtime values of environment variables named in `redactions`, secret-like values present in the command environment, and built-in token patterns. Redaction names are stored in policy, but their resolved values are not added to the proof. Redactions do not prevent a command from reading or exfiltrating a value.

The normalized policy is stored verbatim in every proof bundle. Never place live credentials in static `commands[].env`. If a command truly needs a host secret, name it in both `inheritEnv` and `redactions`, understand that candidate code can access it, and prefer an externally sandboxed short-lived credential. The raw Git diff is bundled without redaction.

When commands are enabled, PatchProof checks that `HEAD` is the candidate commit and the Git worktree is clean before and after the command sequence. A command that leaves tracked or ordinary untracked changes makes verification fail. Git-ignored artifacts are outside this check, so use a fresh checkout for high assurance.

### Scope matching

Paths are normalized to forward slashes. Patterns containing glob syntax use `minimatch` with dotfiles enabled, negation/comments disabled, and basename matching disabled. A pattern without glob characters matches either the exact path or its directory subtree.

Denied matches are blocking. When `allowed` is nonempty, a path that matches none of its entries is blocking. Contract `outOfScope` patterns are also blocking. Renames and copies evaluate both old and new paths.

### Built-in rule IDs

Contracts use these kebab-case public IDs:

| Policy key | Contract rule ID |
| --- | --- |
| `policyIntegrity` | `policy-integrity` |
| `testIntegrity` | `test-integrity` |
| `secretScan` | `secret-scan` |
| `dependencyReview` | `dependency-review` |
| `scope` | `scope` |
| `diffSize` | `diff-size` |

`missing-test-changes` always runs and is driven by `requireTestsForSourceChanges` plus contract `requireTestChange`; it is not a configurable contract rule ID.

## Complete contract example

This contract matches the policy above:

```yaml
version: 1
id: password-history-change
title: Prevent reuse of recent passwords
task: Reject a profile password update when the proposed password appears among the user's five most recent password hashes.
claims:
  - id: requested-behavior
    statement: Password reuse is rejected and covered by the repository test suite.
    severity: blocking
    evidence:
      commands:
        - tests
      paths:
        - src/**
      requireTestChange: true
  - id: types-remain-valid
    statement: The patch passes TypeScript type checking.
    severity: blocking
    evidence:
      commands:
        - types
  - id: tests-remain-active
    statement: Existing tests are not deleted, skipped, or detectably weakened.
    severity: blocking
    evidence:
      rules:
        - test-integrity
  - id: patch-stays-in-scope
    statement: Every changed path remains inside approved policy and task scope.
    severity: blocking
    evidence:
      rules:
        - scope
        - policy-integrity
  - id: no-added-secrets
    statement: Added text contains no detected credential material.
    severity: blocking
    evidence:
      rules:
        - secret-scan
outOfScope:
  - .env*
  - .patchproof/keys/**
  - .github/workflows/**
```

Validate both files and their cross-references with:

```sh
patchproof doctor
```

### Contract fields

| Field | Rules |
| --- | --- |
| `version` | Must be `1` |
| `id` | Stable identifier using the command-ID character rules |
| `title` | Nonempty, at most 500 characters |
| `task` | Optional nonempty task text, at most 50,000 characters |
| `claims` | 1 to 1,000 uniquely identified claims |
| `outOfScope` | Up to 1,000 nonempty patterns, each at most 2,000 characters |

Each claim has an `id`, a nonempty `statement` up to 4,000 characters, `severity` (`blocking` by default), and `evidence`.

### Evidence requirements

- `commands`: every listed policy command must pass.
- `rules`: every listed and enabled analyzer must emit passing evidence.
- `paths`: at least one changed file must match every listed pattern.
- `requireTestChange`: when `true`, at least one recognized test path must change.

All requirements in a claim must pass. A command or rule failure disproves it; missing or skipped evidence leaves it unproven. A claim with an empty `evidence` object is always unproven.

Rule evidence fails on warnings as well as blocking findings. Consequently, a warning from an analyzer can disprove a blocking claim that names that analyzer even though warnings do not directly reject a patch.

### Writing useful claims

Prefer claims that are narrow, falsifiable, and connected to deterministic evidence:

- Good: "Malformed refresh tokens are rejected by the test suite" with `commands: [tests]` and `requireTestChange: true`.
- Weak: "The authentication system is secure" because no finite command or heuristic rule proves the statement.
- Misleading: a `paths` requirement used as a scope restriction; it proves only that a matching path exists.

Required policy commands affect the verdict even when no claim names them. Claims should still name the commands that substantively support their statements so the report exposes the reasoning graph.

## Changing policy safely

Because policy changes alter the rules of judgment, keep them separate from the patch they would judge:

1. Propose the policy change alone.
2. Review its scope, commands, environment, thresholds, and disabled rules as security-sensitive code.
3. Merge it into the trusted base.
4. Verify implementation branches against that new base.

Do not present `--trust-working-policy` output as equivalent to a base-commit seal.
