// PatchProof report styles. See DESIGN.md ("The Proof Sheet") for the system behind these tokens.
// The report must stay fully offline: no web fonts, no remote images. Grain is an inline SVG data URI.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 2.2 -.6'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

export const REPORT_STYLES = String.raw`
:root {
  color-scheme: light;
  --paper: #fbfaf8;
  --sheet: #ffffff;
  --wash: #f3f2ee;
  --wash-strong: #e9e8e3;
  --ink: #111110;
  --ink-soft: #3b3b38;
  --muted: #696864;
  --quiet: #84837d;
  --ash: #bdbdba;
  --rule: #e3e2dd;
  --rule-strong: #cdccc6;
  --pass: #1d6646;
  --pass-wash: #e4f1e9;
  --fail: #a12f29;
  --fail-wash: #fbe7e4;
  --warn: #75560b;
  --warn-wash: #f7edcb;
  --diff-add: #e8f4ec;
  --diff-del: #fbeae7;
  --font: "Inter Display", Inter, "Helvetica Neue", "Segoe UI Variable Display", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  --mono: "JetBrains Mono", "SF Mono", "SFMono-Regular", ui-monospace, Consolas, "Liberation Mono", monospace;
  --gutter: clamp(18px, 4vw, 56px);
  --radius: 18px;
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --topbar: 60px;
  --grain: ${GRAIN};

  /* Verdict atmosphere. Rejected is the default; other verdicts override the five stops. */
  --atmo-base: #e3a17f;
  --atmo-1: #e9c65c;
  --atmo-2: #e27b3f;
  --atmo-3: #d8464e;
  --atmo-4: #aaa6d2;
  --atmo-5: #f3d6c9;
}
.verdict-verified {
  --atmo-base: #b8cfc1;
  --atmo-1: #dfe3a8;
  --atmo-2: #7cbf9c;
  --atmo-3: #4f9ea3;
  --atmo-4: #b9b3e2;
  --atmo-5: #eef1e6;
}
.verdict-incomplete {
  --atmo-base: #e9d3a2;
  --atmo-1: #f3e4a4;
  --atmo-2: #e9b558;
  --atmo-3: #e3926e;
  --atmo-4: #c6c0dd;
  --atmo-5: #f6ecd6;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: calc(var(--topbar) + 16px); background: var(--paper); }
body {
  margin: 0;
  color: var(--ink);
  background: var(--paper);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.55;
  font-feature-settings: "ss01", "cv11";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
button, select, input { font: inherit; color: inherit; }
button, a, select, summary { -webkit-tap-highlight-color: transparent; }
a { color: var(--ink); text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { text-decoration-thickness: 2px; }
code { font-family: var(--mono); }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; border-radius: 4px; }
.skip-link {
  position: fixed; z-index: 60; top: 10px; left: 10px; transform: translateY(-160%);
  padding: 9px 14px; color: var(--sheet); background: var(--ink); border-radius: 999px; text-decoration: none;
}
.skip-link:focus { transform: translateY(0); }
.icon { width: 1.05em; height: 1.05em; flex: 0 0 auto; }
.hidden { display: none !important; }
[hidden] { display: none !important; }

/* ---------- Top bar ---------- */
.topbar {
  position: sticky; top: 0; z-index: 40; height: var(--topbar);
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px;
  padding: 0 var(--gutter); background: var(--paper); border-bottom: 1px solid transparent;
  transition: border-color 220ms var(--ease);
}
.topbar[data-scrolled="true"] { border-bottom-color: var(--rule); }
.brand { display: inline-flex; align-items: center; width: max-content; color: var(--ink); }
.wordmark { display: block; height: 24px; width: auto; }
.topbar nav { display: flex; align-items: center; gap: 2px; }
.topbar nav a {
  position: relative; display: inline-flex; align-items: flex-start; gap: 2px; min-height: 40px; padding: 10px 11px;
  color: var(--muted); font-size: 13px; font-weight: 500; text-decoration: none; white-space: nowrap;
  border-radius: 999px; transition: color 160ms var(--ease), background-color 160ms var(--ease);
}
.topbar nav a:hover { color: var(--ink); background: var(--wash); }
.topbar nav a[aria-current="true"] { color: var(--ink); }
.topbar nav a[aria-current="true"]::after {
  content: ""; position: absolute; left: 11px; right: 11px; bottom: 7px; height: 1px; background: var(--ink);
}
.nav-count { font: 500 10px/1 var(--mono); color: var(--quiet); transform: translateY(-1px); }
.topbar-action { justify-self: end; }
.text-button {
  min-height: 40px; display: inline-flex; align-items: center; gap: 7px; padding: 8px 2px;
  background: none; border: 0; color: var(--ink); font-size: 13px; font-weight: 500; cursor: pointer;
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px;
}
.text-button:hover { text-decoration-thickness: 2px; }

/* ---------- Hero ---------- */
.hero { padding: clamp(40px, 7vw, 96px) var(--gutter) clamp(32px, 5vw, 56px); }
.hero-grid {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.55fr); gap: 40px clamp(32px, 6vw, 96px);
  align-items: end; max-width: 1360px;
}
.hero-aside { display: grid; gap: 14px; color: var(--muted); font-size: 14px; line-height: 1.45; padding-bottom: 4px; }
.hero-aside p { margin: 0; max-width: 34ch; }
.hero-aside strong { color: var(--ink); font-weight: 500; }
.eyebrow { color: var(--quiet); font: 500 11px/1.4 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
.ref-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ink-soft); font: 12px/1.5 var(--mono); }
.ref-line code { padding: 3px 7px; background: var(--wash); border-radius: 6px; }
.ref-line .ref-name { color: var(--muted); }
.ref-arrow { color: var(--quiet); }
.intro { min-width: 0; }
.intro h1 {
  margin: 18px 0 0; max-width: 18ch; font-size: clamp(2.3rem, 5.2vw, 4.25rem); font-weight: 500; line-height: 1.02;
  letter-spacing: -0.042em; text-wrap: balance;
}
.hero-summary { max-width: 52ch; margin: 22px 0 0; color: var(--ink-soft); font-size: 1.0625rem; line-height: 1.5; text-wrap: pretty; }

/* ---------- Atmosphere (verdict-tinted grain field) ---------- */
.atmosphere {
  position: relative; isolation: isolate; overflow: hidden; margin: 0 var(--gutter);
  min-height: clamp(150px, 19vw, 260px); border-radius: var(--radius); background: var(--atmo-base);
}
.atmosphere-field {
  position: absolute; inset: -20%; z-index: -2; filter: blur(34px) saturate(1.08);
  background:
    radial-gradient(30% 52% at 22% 40%, var(--atmo-1) 0%, transparent 72%),
    radial-gradient(28% 60% at 42% 68%, var(--atmo-2) 0%, transparent 72%),
    radial-gradient(26% 58% at 61% 46%, var(--atmo-3) 0%, transparent 70%),
    radial-gradient(22% 62% at 80% 40%, var(--atmo-4) 0%, transparent 74%),
    radial-gradient(40% 34% at 50% 14%, var(--atmo-5) 0%, transparent 76%);
  animation: drift 26s var(--ease) infinite alternate;
}
.atmosphere::after {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background-image: var(--grain); background-size: 220px 220px; mix-blend-mode: overlay; opacity: 0.75;
}
.atmosphere-label {
  position: absolute; bottom: 14px; color: var(--ink); font: 500 12px/1.4 var(--font);
}
.atmosphere-label.left { left: 18px; }
.atmosphere-label.right { right: 18px; }
@keyframes drift {
  from { transform: translate3d(-2%, 0, 0) scale(1); }
  to { transform: translate3d(2.5%, -3%, 0) scale(1.06); }
}

/* ---------- Metrics ---------- */
.metrics {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; padding: 0 var(--gutter);
}
.metric { min-width: 0; padding: 18px 16px 22px 0; border-bottom: 1px solid var(--rule); }
.metric + .metric { padding-left: 16px; border-left: 1px solid var(--rule); }
.metric dt { color: var(--muted); font-size: 12.5px; font-weight: 450; }
.metric dd { margin: 6px 0 0; font: 450 clamp(1.6rem, 2.8vw, 2.25rem)/1.05 var(--font); letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
.metric small { color: var(--quiet); font-size: 0.55em; letter-spacing: -0.01em; }
.changes { white-space: nowrap; font-variant-numeric: tabular-nums; }
.changes span:first-child { color: var(--pass); }
.changes span:last-child { color: var(--fail); }

/* ---------- Sections ---------- */
.main { max-width: 1440px; padding: 0 var(--gutter) 40px; }
.section {
  display: grid; grid-template-columns: minmax(200px, 0.62fr) minmax(0, 1.55fr); gap: 24px clamp(32px, 6vw, 96px);
  padding: clamp(48px, 6vw, 80px) 0; border-bottom: 1px solid var(--rule);
}
.section:last-child { border-bottom: 0; }
.section-head { align-self: start; position: sticky; top: calc(var(--topbar) + 24px); min-width: 0; }
.section-index { display: block; margin-bottom: 14px; color: var(--quiet); font: 500 11px/1 var(--mono); letter-spacing: 0.06em; }
.section h2 { margin: 0; font-size: clamp(1.6rem, 2.4vw, 2.1rem); font-weight: 500; line-height: 1.08; letter-spacing: -0.035em; text-wrap: balance; }
.section-intro { max-width: 36ch; margin: 12px 0 0; color: var(--muted); font-size: 14px; line-height: 1.5; text-wrap: pretty; }
.section-body { min-width: 0; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; margin-top: 22px; }
.filter {
  min-height: 40px; max-width: 100%; padding: 8px 30px 8px 14px; color: var(--ink); background: var(--sheet);
  border: 1px solid var(--rule-strong); border-radius: 999px; font-size: 13px; cursor: pointer;
  transition: border-color 160ms var(--ease);
}
.filter:hover { border-color: var(--ink); }
.result-count { color: var(--quiet); font: 12px var(--mono); }
.toolbar-actions { display: flex; flex-basis: 100%; gap: 18px; }

/* ---------- Status chips ---------- */
.status {
  display: inline-flex; align-items: center; gap: 6px; width: max-content; padding: 4px 10px 4px 8px;
  border-radius: 999px; font-size: 12px; line-height: 1.35; font-weight: 550; text-transform: capitalize;
  color: var(--ink-soft); background: var(--wash);
}
.status .icon { width: 14px; height: 14px; }
.status-proven, .status-passed, .status-verified { color: var(--pass); background: var(--pass-wash); }
.status-disproven, .status-failed, .status-error, .status-rejected, .severity-blocking { color: var(--fail); background: var(--fail-wash); }
.status-unproven, .status-skipped, .status-incomplete, .severity-warning { color: var(--warn); background: var(--warn-wash); }
.severity-info { color: var(--ink-soft); background: var(--wash); }
.status-lg { padding: 6px 14px 6px 11px; font-size: 13px; }

/* ---------- Findings ---------- */
.finding { padding: 28px 0; border-top: 1px solid var(--rule); overflow-wrap: anywhere; }
.finding:first-child { padding-top: 0; border-top: 0; }
.finding-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.rule-name, .file-kind { color: var(--muted); font: 12px var(--mono); }
.finding h3 { margin: 14px 0 6px; font-size: 1.35rem; font-weight: 500; line-height: 1.22; letter-spacing: -0.022em; text-wrap: balance; }
.finding p { margin: 6px 0; max-width: 62ch; color: var(--muted); }
.finding .fix { margin-top: 14px; color: var(--ink); }
.fix strong { display: block; margin-bottom: 2px; color: var(--quiet); font: 500 11px/1.4 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
.finding-with-patch { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.finding-links { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 20px; margin-top: 10px; color: var(--muted); font: 12px var(--mono); }
.finding-links a { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; color: var(--ink); }
.excerpt { min-width: 0; margin: 14px 0 0; overflow: hidden; background: var(--sheet); border: 1px solid var(--rule); border-radius: 14px; }
.excerpt figcaption { display: flex; align-items: center; gap: 8px; padding: 11px 14px; color: var(--muted); font: 12px var(--mono); border-bottom: 1px solid var(--rule); overflow-wrap: anywhere; }
.excerpt pre { margin: 0; padding: 6px 0; max-height: none; border-radius: 0; background: var(--sheet); white-space: pre-wrap; }
.excerpt pre span { display: block; padding: 5px 14px; }
.excerpt i { display: inline-block; min-width: 2.4em; font-style: normal; color: var(--quiet); }
.excerpt-added { background: var(--diff-add); }
.excerpt-removed { background: var(--diff-del); }

/* ---------- Changed files ---------- */
.path-search { display: grid; gap: 6px; margin-top: 22px; color: var(--muted); font-size: 12.5px; }
.path-search input {
  min-height: 40px; width: 100%; max-width: 280px; padding: 8px 14px; background: var(--sheet); color: var(--ink);
  border: 1px solid var(--rule-strong); border-radius: 999px; font-size: 13px;
}
.path-search input:hover { border-color: var(--ink); }
.patch-file { border-top: 1px solid var(--rule); }
.patch-file:last-of-type { border-bottom: 1px solid var(--rule); }
.patch-file summary { display: flex; gap: 12px; align-items: center; min-height: 56px; cursor: pointer; list-style: none; }
.patch-file summary::-webkit-details-marker { display: none; }
.patch-file summary .icon { color: var(--quiet); transition: transform 220ms var(--ease); }
.patch-file[open] summary .icon { transform: rotate(90deg); color: var(--ink); }
.patch-file summary:hover .file-path { text-decoration: underline; text-underline-offset: 4px; }
.file-path { flex: 1; min-width: 0; overflow-wrap: anywhere; font: 500 13px var(--mono); }
.patch-file summary .changes { font: 12px var(--mono); }
.patch-view { margin-bottom: 18px; }
.diff-grid { max-height: 32rem; overflow: auto; background: var(--sheet); border: 1px solid var(--rule); border-radius: 14px; font: 12px/1.7 var(--mono); tab-size: 2; }
.diff-row { display: grid; grid-template-columns: 4em 4em 1fr; width: max-content; min-width: 100%; white-space: pre; }
.diff-row span:nth-child(-n+2) { padding-right: 1em; text-align: right; color: var(--quiet); user-select: none; }
.diff-row span:last-child { padding-inline: 10px; }
.diff-add { background: var(--diff-add); }
.diff-del { background: var(--diff-del); }
.diff-hunk { background: var(--wash); color: var(--muted); }
.diff-target { outline: 2px solid var(--ink); outline-offset: -2px; }
.diff-pager { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 8px; color: var(--muted); font-size: 13px; }
.diff-pager button {
  min-height: 40px; padding: 6px 14px; background: var(--sheet); border: 1px solid var(--rule-strong); border-radius: 999px; cursor: pointer;
}
.diff-pager button:disabled { color: var(--quiet); cursor: not-allowed; }

/* ---------- Claims ---------- */
.claim-list { border-top: 1px solid var(--rule); }
.claim {
  display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; column-gap: 16px; align-items: start;
  padding: 22px 0; border-bottom: 1px solid var(--rule); overflow-wrap: anywhere;
}
.claim-mark { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; color: var(--muted); background: var(--wash); }
.claim-mark .icon { width: 16px; height: 16px; }
[data-status="proven"] > .claim-mark, [data-status="passed"] .claim-mark { color: var(--pass); background: var(--pass-wash); }
[data-status="disproven"] > .claim-mark, [data-status="failed"] .claim-mark, [data-status="error"] .claim-mark { color: var(--fail); background: var(--fail-wash); }
[data-status="unproven"] > .claim-mark, [data-status="skipped"] .claim-mark { color: var(--warn); background: var(--warn-wash); }
.claim h3 { margin: 4px 0 4px; font-size: 1.08rem; font-weight: 500; line-height: 1.35; letter-spacing: -0.012em; text-wrap: pretty; }
.claim-id { color: var(--quiet); font: 11px var(--mono); }
.claim p { margin: 6px 0 0; max-width: 66ch; color: var(--muted); }
.evidence-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.evidence-link {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; color: var(--ink-soft); background: var(--wash);
  border-radius: 999px; font: 11px var(--mono); text-decoration: none; transition: background-color 160ms var(--ease);
}
.evidence-link:hover { background: var(--wash-strong); color: var(--ink); }

/* ---------- Proof graph ---------- */
.graph-layout { display: grid; gap: 24px; }
.graph-canvas { min-width: 0; padding: 18px; background: var(--wash); border-radius: var(--radius); overflow-x: auto; }
.graph-canvas svg { display: block; min-width: 620px; width: 100%; height: auto; }
.graph-edge { stroke: var(--rule-strong); stroke-width: 1.5; fill: none; }
.graph-edge-passed { stroke: var(--ink); }
.graph-node { fill: var(--sheet); stroke: var(--rule-strong); stroke-width: 1.5; }
.graph-node-proven, .graph-node-passed { stroke: var(--pass); }
.graph-node-disproven, .graph-node-failed, .graph-node-error { stroke: var(--fail); }
.graph-node-unproven, .graph-node-skipped { stroke: #c79a2a; }
.graph-verdict { fill: var(--ink); stroke: none; }
.graph-verdict-label { fill: var(--sheet); font-family: var(--font); font-size: 11px; font-weight: 600; }
.graph-verdict-sub { fill: var(--ash); font-family: var(--mono); font-size: 9px; }
.graph-label { fill: var(--ink); font-family: var(--font); font-size: 11px; font-weight: 550; }
.graph-sub { fill: var(--muted); font-family: var(--mono); font-size: 9px; }
.graph-canvas g[tabindex]:focus { outline: none; }
.graph-canvas g[tabindex]:focus-visible rect { stroke: var(--ink); stroke-width: 2.5; }
.semantic-graph { margin: 0; padding: 0; list-style: none; counter-reset: claim; border-top: 1px solid var(--rule); }
.semantic-graph li { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 0 16px; padding: 14px 0; border-bottom: 1px solid var(--rule); counter-increment: claim; }
.semantic-graph li::before { content: counter(claim, decimal-leading-zero); color: var(--quiet); font: 11px/1.9 var(--mono); }
.semantic-graph strong { display: block; font-weight: 500; }
.semantic-graph span { grid-column: 2; color: var(--muted); font-size: 13px; }

/* ---------- Evidence ---------- */
.evidence-list { border-top: 1px solid var(--rule); }
.evidence-item { border-bottom: 1px solid var(--rule); overflow-wrap: anywhere; }
.evidence-item summary {
  min-height: 64px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto 20px; gap: 16px;
  align-items: center; padding: 12px 0; cursor: pointer; list-style: none;
}
.evidence-item summary::-webkit-details-marker { display: none; }
.evidence-item summary::after { content: "+"; justify-self: end; color: var(--muted); font-size: 20px; font-weight: 300; line-height: 1; }
.evidence-item[open] summary::after { content: "\2212"; }
.evidence-item summary:hover strong { text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px; }
.evidence-summary strong { display: block; font-weight: 500; }
.evidence-summary span { display: block; color: var(--muted); font: 11.5px/1.6 var(--mono); }
.evidence-body { padding: 0 0 22px 48px; }
.metadata { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 0 0 14px; color: var(--muted); font-size: 12px; }
.metadata dt { color: var(--quiet); font: 500 10.5px/1.6 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
.metadata dd { margin: 0; font-family: var(--mono); color: var(--ink); }
pre {
  max-height: 430px; margin: 10px 0 0; padding: 16px 18px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--ink); background: var(--wash); border-radius: 14px; font: 12px/1.65 var(--mono); tab-size: 2;
}
.empty { margin: 0; padding: 22px 0; color: var(--muted); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }

/* ---------- Integrity ---------- */
.integrity-grid { display: grid; grid-template-columns: minmax(200px, 0.7fr) minmax(0, 1.3fr); gap: 32px; align-items: start; }
.integrity-status { padding: 24px; background: var(--wash); border-radius: var(--radius); }
.integrity-status .mark { display: block; width: 46px; height: auto; margin-bottom: 26px; }
.integrity-status strong { display: block; font-size: 1.2rem; font-weight: 500; letter-spacing: -0.02em; }
.integrity-status p { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
.digest-list { margin: 0; border-top: 1px solid var(--rule); }
.digest-row { display: grid; grid-template-columns: 130px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--rule); }
.digest-row dt { color: var(--muted); font-size: 13px; }
.digest-row dd { margin: 0; font: 11px/1.55 var(--mono); color: var(--ink-soft); overflow-wrap: anywhere; }
.copy {
  width: 40px; height: 40px; display: grid; place-items: center; color: var(--muted); background: transparent;
  border: 0; border-radius: 50%; cursor: pointer; transition: background-color 160ms var(--ease), color 160ms var(--ease);
}
.copy:hover { color: var(--ink); background: var(--wash); }
.copy[data-copied="true"] { color: var(--pass); }

/* ---------- Colophon ---------- */
.colophon { padding: 0 var(--gutter) var(--gutter); }
.colophon .atmosphere { margin: 0; padding: clamp(120px, 15vw, 190px) clamp(8px, 1vw, 12px) clamp(8px, 1vw, 12px); }
.colophon-panel { position: relative; padding: clamp(24px, 3.5vw, 44px); background: var(--sheet); border-radius: calc(var(--radius) - 6px); }
.colophon-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 28px; }
.colophon-lede { margin: 0; max-width: 24ch; font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 500; line-height: 1.12; letter-spacing: -0.032em; }
.colophon-lede span { display: block; color: var(--quiet); }
.colophon-digest { display: grid; gap: 6px; justify-items: end; text-align: right; }
.colophon-digest small { color: var(--quiet); font: 500 11px/1.4 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
.colophon-digest code { font-size: clamp(0.95rem, 1.5vw, 1.2rem); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 5px; overflow-wrap: anywhere; }
.colophon-columns { display: flex; flex-wrap: wrap; gap: 28px clamp(40px, 8vw, 120px); margin-top: clamp(48px, 7vw, 96px); font-size: 13px; }
.colophon-columns h2 { margin: 0 0 8px; color: var(--quiet); font-size: 12.5px; font-weight: 450; }
.colophon-columns ul { margin: 0; padding: 0; list-style: none; }
.colophon-columns li { line-height: 1.75; }
.colophon-columns a { text-decoration: none; }
.colophon-columns a:hover { text-decoration: underline; }
.colophon-bottom {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px 28px;
  margin-top: 34px; padding-top: 18px; border-top: 1px solid var(--rule); color: var(--muted); font-size: 12.5px;
}
.colophon-bottom .wordmark { height: 18px; }

/* ---------- Responsive ---------- */
@media (max-width: 1100px) {
  .finding-with-patch { display: block; }
  .section { grid-template-columns: 1fr; }
  .section-head { position: static; }
  .section-intro { max-width: 60ch; }
  .integrity-grid { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  :root { --topbar: 104px; }
  .topbar { height: auto; grid-template-columns: 1fr auto; row-gap: 0; padding-top: 10px; }
  .topbar nav {
    grid-column: 1 / -1; order: 3; margin: 0 calc(var(--gutter) * -1); padding: 0 calc(var(--gutter) - 10px);
    overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain;
  }
  .topbar nav::-webkit-scrollbar { display: none; }
  .hero-grid { grid-template-columns: 1fr; }
  .hero-aside { order: 2; }
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metric:nth-child(3) { padding-left: 0; border-left: 0; }
}
@media (max-width: 620px) {
  body { font-size: 14.5px; }
  .atmosphere-label.right { display: none; }
  .claim { grid-template-columns: 32px minmax(0, 1fr); }
  .claim > .status { grid-column: 2; margin-top: 12px; }
  .evidence-item summary { grid-template-columns: 32px minmax(0, 1fr) 16px; }
  .evidence-item summary .status { grid-column: 2; grid-row: 2; }
  .evidence-item summary::after { grid-column: 3; grid-row: 1; }
  .evidence-body { padding-left: 0; }
  .digest-row { grid-template-columns: 1fr auto; }
  .digest-row dd { grid-column: 1 / -1; grid-row: 2; }
  .file-kind { display: none; }
  .colophon-digest { justify-items: start; text-align: left; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .atmosphere-field { animation: none; }
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
}

@media print {
  .topbar, .toolbar, .path-search, .copy, .skip-link, .atmosphere-field, .atmosphere::after { display: none !important; }
  body, html { background: white; }
  .atmosphere { min-height: 0; background: none; border: 1px solid var(--rule); }
  .atmosphere-label { position: static; display: inline-block; padding: 10px 14px; color: var(--ink); text-shadow: none; }
  .colophon .atmosphere { padding: 0; border: 0; }
  .section { display: block; break-inside: avoid; }
  .section-head { position: static; margin-bottom: 18px; }
  .evidence-item:not([open]) .evidence-body { display: block; }
  pre { max-height: none; white-space: pre-wrap; }
  a { color: inherit; text-decoration: none; }
}
`;
