# Product

## Register

product

## Users

PatchProof is for AI developers, open-source maintainers, and engineering teams that delegate repository work to coding agents. They use terminal agents, IDE agents, pull-request agents, and CI automation, then need to decide whether a generated change is safe to review or merge. Their central job is not producing more code. It is obtaining credible, reproducible evidence that the requested behavior changed without hidden regressions, weakened tests, policy tampering, or unrequested scope.

## Product Purpose

PatchProof is an independent verification layer for AI-written code. It converts a task contract into falsifiable claims, loads verification policy from the trusted base commit, runs deterministic checks, records evidence in a hash chain, and produces a portable proof bundle that another machine can verify. Optional local or cloud models may help draft contracts, but they never decide the verdict.

Success means a reviewer can answer four questions quickly: what the agent claimed, what evidence supports each claim, what remains uncertain, and whether the evidence itself was altered. The tool must be useful from a local terminal, in CI, and on a GitHub pull request without requiring an account or hosted service.

## Brand Personality

Rigorous, lucid, and playfully investigative. PatchProof speaks like a strong reviewer who is precise without being theatrical. Its moments of delight come from exposing causal links, counterexamples, and hidden risk, not from mascots, confetti, or inflated scores.

## Anti-references

- Generic dark AI dashboards with purple gradients, neon glows, and decorative terminal chrome.
- Conversational code-review bots that provide confident summaries without reproducible evidence.
- Equal-card SaaS grids, fake activity metrics, and abstract trust scores with no inspectable inputs.
- Security interfaces that use fear, opaque severity, or red everywhere instead of explaining the exact source-to-result chain.
- Agent launchers and worktree dashboards that treat orchestration itself as the product.

## Design Principles

1. **Evidence before confidence.** Every positive claim links to a command, rule, artifact, or explicit human attestation.
2. **Show the causal chain.** A reviewer can move from verdict to claim to evidence to raw output without losing context.
3. **Keep authority deterministic.** Models can propose; versioned policy and deterministic verifiers decide.
4. **Make uncertainty useful.** Unproven claims and untested surfaces are first-class results, never hidden behind a score.
5. **Reward investigation.** Dense technical material should feel navigable and satisfying to inspect.

## Accessibility & Inclusion

PatchProof targets WCAG 2.2 AA. Every workflow must be keyboard accessible; focus must be visible; status cannot depend on color alone; body text and log output must remain readable at 200% zoom; motion must respect reduced-motion preferences; tables and proof graphs need semantic text alternatives; and command output must be understandable in high-contrast and color-blind display modes.
