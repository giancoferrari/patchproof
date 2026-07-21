---
name: PatchProof
description: Independent, inspectable evidence for AI-written code.
colors:
  proof-blue: "oklch(0.570 0.160 230)"
  proof-blue-deep: "oklch(0.410 0.125 230)"
  annotation-orange: "oklch(0.650 0.185 35)"
  verified-green: "oklch(0.520 0.135 150)"
  warning-gold: "oklch(0.880 0.105 88)"
  failed-red: "oklch(0.555 0.195 25)"
  canvas: "oklch(1.000 0.000 0)"
  surface: "oklch(0.965 0.008 230)"
  surface-strong: "oklch(0.925 0.014 230)"
  ink: "oklch(0.190 0.025 235)"
  muted-ink: "oklch(0.455 0.030 235)"
  rule: "oklch(0.850 0.014 230)"
typography:
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 450
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "0.02em"
  mono:
    fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 450
    lineHeight: 1.55
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "7px"
  md: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.proof-blue-deep}"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.proof-blue}"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  status-proven:
    backgroundColor: "{colors.verified-green}"
    textColor: "{colors.canvas}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "5px 9px"
  status-blocked:
    backgroundColor: "{colors.failed-red}"
    textColor: "{colors.canvas}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "5px 9px"
---

# Design System: PatchProof

## Overview

**Creative North Star: "The Forensic Workbench"**

PatchProof feels like a precise evidence table in a bright engineering lab. The canvas is neutral and calm; cobalt marks active reasoning, orange marks annotations, and semantic colors appear only where a verifier has produced an actual state. The interface is compact enough for experts while preserving a clear path from verdict to raw evidence.

The visual system rejects generic dark AI dashboards, decorative terminal chrome, and opaque trust meters. Delight comes from the proof graph resolving, a counterexample appearing beside a claim, and a hash chain visibly closing. Familiar controls keep the investigator focused on the evidence.

**Key Characteristics:**

- Light, neutral working canvas with crisp cobalt navigation.
- Dense evidence arranged through hierarchy, not nested cards.
- Monospaced detail only where data provenance benefits from it.
- Semantic status always paired with an icon and explicit text.
- Short, state-driven transitions with full reduced-motion support.

## Colors

The palette uses restrained laboratory neutrals, one cobalt action color, and explicit semantic colors for findings.

### Primary

- **Proof Blue:** Active navigation, selected evidence, focus rings, links, and graph edges that represent verified relationships.
- **Deep Proof Blue:** Primary actions and high-contrast anchors.

### Secondary

- **Annotation Orange:** Counterexamples, human annotations, and noteworthy but non-failing evidence. It is never used as decoration.

### Tertiary

- **Verified Green:** Proven claims and successful deterministic checks.
- **Warning Gold:** Unproven or incomplete evidence, always with dark ink.
- **Failed Red:** Disproven claims and blocking verifier failures.

### Neutral

- **Canvas:** The primary workspace and report background.
- **Surface:** Toolbars, grouped evidence, and quiet secondary regions.
- **Surface Strong:** Selected rows and structural separation.
- **Ink:** Primary text and code-adjacent labels.
- **Muted Ink:** Secondary text that still meets body-text contrast requirements.
- **Rule:** Hairline borders and table dividers.

### Named Rules

**The Earned Color Rule.** Semantic color appears only when a verifier or user action has produced a state.

**The One Active Blue Rule.** Proof Blue identifies the current path or action. It never competes with status colors.

## Typography

**Display Font:** Inter with the system sans fallback
**Body Font:** Inter with the system sans fallback
**Label/Mono Font:** JetBrains Mono with platform monospace fallbacks

**Character:** A single disciplined sans family keeps the product familiar and fast. Monospace is reserved for hashes, paths, commands, timestamps, and raw evidence.

### Hierarchy

- **Headline** (700, 2rem, 1.15): Report verdicts and primary page titles.
- **Title** (650, 1.125rem, 1.3): Claim groups, evidence sections, and inspector headings.
- **Body** (450, 0.9375rem, 1.55): Explanations and findings, capped at 72 characters where prose is continuous.
- **Label** (650, 0.75rem, 0.02em): Short state labels, table headings, and filter counts. Sentence case is the default.
- **Mono** (450, 0.8125rem, 1.55): Commands, file paths, hashes, logs, and machine-readable identifiers.

### Named Rules

**The Provenance Type Rule.** Monospace means the value can be copied, compared, or verified. It is never decorative.

## Elevation

PatchProof is flat by default. Depth comes from tonal layering, sticky toolbars, and selected-state contrast. A small structural shadow is permitted only for a floating command palette or popover that must sit above evidence.

### Shadow Vocabulary

- **Overlay:** `0 6px 8px oklch(0.190 0.025 235 / 0.14)`, reserved for command palettes, menus, and tooltips.
- **Sticky edge:** `0 1px 0 oklch(0.850 0.014 230)`, used to separate a sticky region from scrolling evidence.

### Named Rules

**The Flat Evidence Rule.** Evidence is separated by alignment and rules. A shadow must communicate actual overlap.

## Components

### Buttons

- **Shape:** Compact, gently curved rectangle (7px radius).
- **Primary:** Deep Proof Blue with white text and 10px by 16px padding.
- **Hover / Focus:** Hover moves to Proof Blue. Focus uses a 2px Proof Blue ring with a 2px canvas gap. Active state moves down by 1px.
- **Secondary / Ghost:** Canvas or transparent background, Ink text, and a structural Rule border only when needed for grouping.

### Chips

- **Style:** Compact state labels with icons and explicit text. Proven and failed chips use white text; warning chips use Ink.
- **State:** Filter chips use tonal neutral fills until selected, then use Deep Proof Blue.

### Cards / Containers

- **Corner Style:** Restrained 12px radius for major report regions; table rows remain square.
- **Background:** Canvas for primary evidence and Surface for grouped metadata.
- **Shadow Strategy:** No resting shadow.
- **Border:** One-pixel Rule only when the container boundary is functionally useful.
- **Internal Padding:** 16px for compact evidence and 24px for major report regions.

### Inputs / Fields

- **Style:** Canvas background, one-pixel Rule stroke, 7px radius, and a minimum 40px target height.
- **Focus:** Proof Blue border and visible two-layer focus ring.
- **Error / Disabled:** Error uses Failed Red plus text; disabled controls retain readable labels and show a not-allowed cursor.

### Navigation

The desktop report uses a narrow evidence rail and a sticky top summary. The active destination uses a tonal blue fill, a Proof Blue icon, and semibold Ink text. On small screens the rail becomes an accessible horizontal tab list; evidence tables become labelled definition rows rather than horizontal scroll traps.

### Proof Graph

The graph uses simple circles and orthogonal connectors to show verdict, claims, and evidence. Every node has a text label, icon, status word, and keyboard focus target. The adjacent claim list is the semantic alternative and remains the primary navigation model.

## Do's and Don'ts

### Do:

- **Do** connect every verdict, claim, and finding to inspectable evidence.
- **Do** use Proof Blue for the current path and reserve semantic colors for real verifier states.
- **Do** keep logs monospaced, selectable, line-wrapped by default, and expandable for full output.
- **Do** preserve familiar controls, visible focus, 40px minimum targets, and reduced-motion behavior.
- **Do** show uncertainty in plain language, including what was not executed or could not be proven.

### Don't:

- **Don't** create generic dark AI dashboards with purple gradients, neon glows, or decorative terminal chrome.
- **Don't** present conversational summaries as evidence or hide raw verifier output.
- **Don't** use equal-card SaaS grids, fake activity metrics, or abstract trust scores with no inspectable inputs.
- **Don't** use security fear, opaque severity, or red everywhere instead of explaining the exact source-to-result chain.
- **Don't** turn the report into an agent launcher or worktree dashboard.
- **Don't** use colored side-stripe borders, gradient text, glassmorphism, or wide decorative shadows.
