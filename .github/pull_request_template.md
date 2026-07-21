## Summary

Explain the user-visible or verifier-visible change and the problem it solves.

## Evidence contract

- Claims added or changed:
- Policy rules or commands affected:
- Proof-bundle compatibility impact:

## Verification

List the exact commands run and summarize their outcomes. Attach a redacted proof bundle or report when the change affects verification behavior.

## Risk analysis

Describe false-positive risk, false-negative risk, compatibility concerns, and the behavior when required evidence is unavailable.

## Checklist

- [ ] Tests cover successful, failing, and uncertain outcomes.
- [ ] `npm run check` passes locally.
- [ ] User-facing behavior and configuration are documented.
- [ ] New evidence is deterministic, inspectable, and free of secrets.
- [ ] Models remain advisory and cannot decide the verdict.
- [ ] Schema or public API changes are backward compatible or explicitly documented.
