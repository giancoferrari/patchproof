---
name: PatchProof
description: Independent, inspectable evidence for AI-written code.
colors:
  ink: "#111110"
  ink-soft: "#3b3b38"
  muted: "#696864"
  quiet: "#84837d"
  ash: "#bdbdba"
  paper: "#fbfaf8"
  sheet: "#ffffff"
  wash: "#f3f2ee"
  wash-strong: "#e9e8e3"
  rule: "#e3e2dd"
  rule-strong: "#cdccc6"
  pass: "#1d6646"
  pass-wash: "#e4f1e9"
  fail: "#a12f29"
  fail-wash: "#fbe7e4"
  warn: "#75560b"
  warn-wash: "#f7edcb"
atmosphere:
  rejected: ["#e3a17f", "#e9c65c", "#e27b3f", "#d8464e", "#aaa6d2", "#f3d6c9"]
  verified: ["#b8cfc1", "#dfe3a8", "#7cbf9c", "#4f9ea3", "#b9b3e2", "#eef1e6"]
  incomplete: ["#e9d3a2", "#f3e4a4", "#e9b558", "#e3926e", "#c6c0dd", "#f6ecd6"]
typography:
  display:
    fontFamily: "Inter Display, Inter, Helvetica Neue, Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.3rem, 5.2vw, 4.25rem)"
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: "-0.042em"
  section:
    fontSize: "clamp(1.6rem, 2.4vw, 2.1rem)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  eyebrow:
    fontFamily: "JetBrains Mono, SF Mono, ui-monospace, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.06em"
    textTransform: uppercase
  mono:
    fontFamily: "JetBrains Mono, SF Mono, ui-monospace, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.65
rounded:
  chip: "999px"
  control: "999px"
  code: "14px"
  panel: "18px"
---

# Design System: PatchProof

## Overview

**Creative North Star: "The Proof Sheet"**

PatchProof reads like an editorial document, not a dashboard. A warm paper canvas, near-black ink, and generous whitespace carry the evidence. Color is held back for two jobs: a grainy, blurred atmosphere band whose palette is set by the verdict, and small semantic chips that mark an actual verifier state.

The references are editorial studio sites: split hero layouts with a small aside next to a large headline, full-width image bands with tiny corner captions, and rounded footer panels that sit on a soft gradient.

**Key characteristics:**

- Monochrome ink on warm paper; the logo's black and ash rectangles set the palette.
- Large, medium-weight headlines with tight tracking. No bold display type.
- Each section is a split row: a sticky left column (index, title, intro, filters) beside the evidence.
- One verdict-tinted grain field opens the report and one closes it.
- Rules and spacing separate evidence. Cards are reserved for code, diffs, and the integrity summary.

## Brand

The mark is two upright sheets: a solid black one and an ash one. Read them as the trusted base and the proposed head, the two commits every proof compares.

| Asset | File |
| --- | --- |
| Wordmark (light backgrounds) | `docs/assets/brand/patchproof-wordmark.svg` |
| Wordmark (dark backgrounds) | `docs/assets/brand/patchproof-wordmark-dark.svg` |
| Mark | `docs/assets/brand/patchproof-mark.svg`, `patchproof-mark-dark.svg` |
| Original raster sources | `docs/assets/brand/*-source.png` |
| Social preview source | `docs/assets/brand/social-preview.html` → `docs/assets/social-preview.jpg` |

The wordmark is vectorized from the source PNG. The report inlines it from `src/report/brand.ts`, and its fills use the `--ink` and `--ash` tokens. On light backgrounds the mark is `ink` + `ash`. On dark backgrounds it is paper (`#f4f3ef`) + `#62625e`. Keep clear space equal to the width of one sheet. Don't recolor the sheets, and don't place the wordmark on the atmosphere field.

## Color

### Neutrals

- **Paper** `#fbfaf8`: page canvas.
- **Sheet** `#ffffff`: code, diffs, inputs, and the colophon panel.
- **Wash / Wash strong**: graph canvas, integrity summary, code chips, hover fills.
- **Ink** `#111110`: text, focus rings, active navigation, passed graph edges.
- **Muted** `#696864`: secondary body text (5.3:1 on paper).
- **Quiet** `#84837d`: eyebrows, counts, and large secondary text only.
- **Ash** `#bdbdba`: the second logo sheet. Not used for text.
- **Rule / Rule strong**: hairlines and control borders.

### Semantic

Pass, fail, and warn each come as a dark text color on a pale wash. They appear only where a verifier produced that state: status chips, claim marks, graph node strokes, diff rows, and changed-line counts.

### Atmosphere

The verdict picks the palette for the grain field: warm yellow, orange, red, and lilac for **rejected** and **error**; sage, teal, and lilac for **verified**; sand, amber, and peach for **incomplete**. It is built from five blurred radial gradients plus an inline SVG `feTurbulence` grain layer. It loads nothing from the network, and a reduced-motion preference stops its slow drift.

### Named rules

**The Earned Color Rule.** Outside the atmosphere band, semantic color appears only when a verifier has produced a state.

**The One Atmosphere Rule.** The atmosphere band shows the verdict and nothing else. The report has one at the top and one in the colophon, never more.

## Typography

The report has to work offline, so it never loads web fonts. The sans stack prefers Inter Display or Inter, then falls back to Helvetica Neue or Segoe UI. Monospace is reserved for values a reviewer can copy, compare, or verify: hashes, paths, commands, IDs, and counts. Section indexes (`01 / 06`) and eyebrows also use it.

- **Display** (500, up to 4.25rem, -0.042em): the contract title in the hero.
- **Section** (500, up to 2.1rem, -0.035em): section titles in the left column.
- **Item** (500, 1.08–1.35rem): finding and claim titles.
- **Body** (400, 15px, 1.55): explanations, capped near 62–66 characters.
- **Eyebrow** (mono 11px, uppercase, 0.06em): labels such as `SUGGESTED FIX`.

## Layout

- **Top bar:** wordmark on the left, section links with superscript counts in the center, and an underlined text action on the right. It sticks to the top and draws a hairline once the page scrolls.
- **Hero:** a split grid. The left aside holds the repository, time, and commit range. The right holds the verdict chip, title, and summary.
- **Metrics:** four columns divided by hairlines, set directly under the atmosphere band.
- **Sections:** `minmax(200px, .62fr) / 1.55fr`. Below 1100px they stack.
- **Colophon:** a white panel inset in the closing atmosphere field. It holds a two-tone lede, the content digest, link columns, and the wordmark.
- **Mobile (≤860px):** the nav becomes a horizontally scrolling row under the wordmark, and the hero aside moves below the title.

## Components

- **Status chip:** pill, icon plus text, semantic wash. Status never relies on color alone.
- **Controls:** pill-shaped selects and search fields with a 40px minimum height and a strong-rule border that darkens to ink on hover.
- **Text button:** underlined, with no fill (Print report, Expand all).
- **Code excerpt / diff:** white sheet, 14px radius, hairline border, pale add/remove rows.
- **Proof graph:** a black pill for the verdict and white rounded nodes stroked with their state. Passed edges are ink, others are rule-colored. An ordered list under the graph gives the same relationships as text.

## Motion

Hover and focus feedback takes 160ms. Disclosure uses 220ms with `cubic-bezier(0.2, 0, 0, 1)`. The atmosphere drifts over a 26s cycle. `prefers-reduced-motion` turns all of it off.

## Do's and Don'ts

### Do

- Connect every verdict, claim, and finding to inspectable evidence.
- Keep the page monochrome apart from the atmosphere band and earned semantic states.
- Keep the report a single offline file with no remote fonts, scripts, or images.
- Preserve visible focus, 40px targets, WCAG 2.2 AA contrast, and reduced-motion behavior.

### Don't

- Build dark neon AI-dashboard chrome or glassmorphism.
- Use gradients anywhere except the atmosphere field, or use gradient text.
- Use equal-card SaaS grids, trust scores, or colored side-stripe borders.
- Put text that carries meaning only on the atmosphere band. Its captions repeat information found elsewhere.
