export const REPORT_STYLES = String.raw`
:root {
  color-scheme: light;
  --proof-blue: oklch(0.57 0.16 230);
  --proof-blue-deep: oklch(0.41 0.125 230);
  --annotation-orange: oklch(0.65 0.185 35);
  --verified: oklch(0.52 0.135 150);
  --verified-soft: oklch(0.95 0.035 150);
  --warning: oklch(0.88 0.105 88);
  --warning-soft: oklch(0.965 0.045 88);
  --failed: oklch(0.555 0.195 25);
  --failed-soft: oklch(0.95 0.045 25);
  --canvas: oklch(1 0 0);
  --surface: oklch(0.965 0.008 230);
  --surface-strong: oklch(0.925 0.014 230);
  --ink: oklch(0.19 0.025 235);
  --muted: oklch(0.455 0.03 235);
  --rule: oklch(0.85 0.014 230);
  --focus: oklch(0.57 0.16 230 / 0.28);
  --font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --rail: 226px;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; background: var(--canvas); }
body {
  margin: 0;
  color: var(--ink);
  background: var(--canvas);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.55;
  text-rendering: optimizeLegibility;
}
button, select { font: inherit; }
button, a, select, summary { -webkit-tap-highlight-color: transparent; }
a { color: var(--proof-blue-deep); text-underline-offset: 3px; }
a:hover { color: var(--proof-blue); }
:focus-visible { outline: 2px solid var(--proof-blue); outline-offset: 3px; }
.skip-link {
  position: fixed; z-index: 60; top: 8px; left: 8px; transform: translateY(-150%);
  padding: 9px 13px; color: var(--canvas); background: var(--proof-blue-deep); border-radius: 7px;
}
.skip-link:focus { transform: translateY(0); }
.icon { width: 1.05em; height: 1.05em; flex: 0 0 auto; }
.shell { min-height: 100vh; display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); }
.rail {
  position: sticky; top: 0; align-self: start; height: 100vh; padding: 22px 16px;
  background: var(--surface); border-right: 1px solid var(--rule); overflow-y: auto;
}
.brand { display: flex; align-items: center; gap: 10px; margin: 2px 8px 28px; font-weight: 760; letter-spacing: -0.025em; }
.brand-mark {
  width: 29px; height: 29px; display: grid; place-items: center; color: var(--canvas);
  background: var(--proof-blue-deep); border-radius: 7px;
}
.rail nav { display: grid; gap: 3px; }
.rail nav a {
  min-height: 40px; display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  color: var(--muted); text-decoration: none; border-radius: 7px; font-weight: 590;
}
.rail nav a:hover, .rail nav a[aria-current="true"] { color: var(--ink); background: var(--surface-strong); }
.rail nav a[aria-current="true"] { color: var(--proof-blue-deep); }
.rail-meta { margin: 30px 8px 0; padding-top: 16px; border-top: 1px solid var(--rule); color: var(--muted); font-size: 12px; }
.rail-meta code { display: block; margin-top: 5px; color: var(--ink); font-family: var(--mono); overflow-wrap: anywhere; }
.content { min-width: 0; }
.hero {
  padding: 34px clamp(22px, 4.5vw, 68px) 28px; border-bottom: 1px solid var(--rule); background: var(--canvas);
}
.hero-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.verdict-lockup { display: flex; gap: 15px; min-width: 0; }
.verdict-symbol {
  width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px;
  background: var(--surface); color: var(--muted);
}
.verdict-symbol .icon { width: 23px; height: 23px; }
.verdict-verified .verdict-symbol { color: var(--verified); background: var(--verified-soft); }
.verdict-rejected .verdict-symbol, .verdict-error .verdict-symbol { color: var(--failed); background: var(--failed-soft); }
.verdict-incomplete .verdict-symbol { color: var(--ink); background: var(--warning); }
.hero h1 { margin: 0; font-size: 2rem; line-height: 1.15; letter-spacing: -0.025em; text-wrap: balance; }
.hero-summary { max-width: 68ch; margin: 8px 0 0; color: var(--muted); text-wrap: pretty; }
.ref-line { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 13px; font-family: var(--mono); font-size: 12px; color: var(--muted); }
.ref-arrow { color: var(--proof-blue); font-family: var(--font); font-weight: 750; }
.hero-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.button {
  min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 9px 13px; border-radius: 7px; border: 1px solid var(--rule); background: var(--canvas);
  color: var(--ink); cursor: pointer; font-weight: 640; transition: background 180ms ease-out, color 180ms ease-out, transform 180ms ease-out;
}
.button:hover { background: var(--surface); }
.button:active { transform: translateY(1px); }
.button-primary { color: var(--canvas); background: var(--proof-blue-deep); border-color: var(--proof-blue-deep); }
.button-primary:hover { color: var(--canvas); background: var(--proof-blue); border-color: var(--proof-blue); }
.metrics {
  display: flex; flex-wrap: wrap; margin: 28px 0 0; padding: 0; list-style: none;
  border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
}
.metric { min-width: 145px; padding: 14px 24px 14px 0; margin-right: 24px; }
.metric + .metric { padding-left: 24px; border-left: 1px solid var(--rule); }
.metric dt { color: var(--muted); font-size: 12px; font-weight: 650; }
.metric dd { margin: 2px 0 0; font-size: 20px; font-weight: 720; letter-spacing: -0.02em; }
.main { max-width: 1280px; padding: 8px clamp(22px, 4.5vw, 68px) 90px; }
.section { padding: 42px 0; scroll-margin-top: 16px; }
.section + .section { border-top: 1px solid var(--rule); }
.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 21px; }
.section h2 { margin: 0; font-size: 1.25rem; line-height: 1.25; letter-spacing: -0.018em; text-wrap: balance; }
.section-intro { max-width: 68ch; margin: 5px 0 0; color: var(--muted); }
.status {
  display: inline-flex; align-items: center; gap: 5px; width: max-content; padding: 4px 8px;
  border-radius: 999px; font-size: 12px; line-height: 1.35; font-weight: 690;
}
.status-proven, .status-passed, .status-verified { color: var(--canvas); background: var(--verified); }
.status-disproven, .status-failed, .status-error, .status-rejected, .severity-blocking { color: var(--canvas); background: var(--failed); }
.status-unproven, .status-skipped, .status-incomplete, .severity-warning { color: var(--ink); background: var(--warning); }
.severity-info { color: var(--proof-blue-deep); background: oklch(0.94 0.035 230); }
.graph-layout { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(270px, .75fr); gap: 28px; align-items: start; }
.graph-canvas { min-width: 0; padding: 16px; background: var(--surface); border-radius: 12px; overflow-x: auto; }
.graph-canvas svg { display: block; min-width: 620px; width: 100%; height: auto; }
.graph-edge { stroke: var(--rule); stroke-width: 2; fill: none; }
.graph-edge-passed { stroke: var(--verified); }
.graph-node { fill: var(--canvas); stroke: var(--rule); stroke-width: 2; }
.graph-node-proven, .graph-node-passed { stroke: var(--verified); }
.graph-node-disproven, .graph-node-failed, .graph-node-error { stroke: var(--failed); }
.graph-node-unproven, .graph-node-skipped { stroke: oklch(0.72 0.11 88); }
.graph-label { fill: var(--ink); font-family: var(--font); font-size: 11px; font-weight: 650; }
.graph-sub { fill: var(--muted); font-family: var(--mono); font-size: 9px; }
.semantic-graph { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--rule); }
.semantic-graph li { padding: 12px 0; border-bottom: 1px solid var(--rule); }
.semantic-graph strong { display: block; margin-bottom: 3px; }
.semantic-graph span { color: var(--muted); font-size: 13px; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.filter {
  min-height: 40px; padding: 8px 32px 8px 10px; color: var(--ink); background: var(--canvas);
  border: 1px solid var(--rule); border-radius: 7px;
}
.result-count { color: var(--muted); font-size: 13px; }
.claim-list { border-top: 1px solid var(--rule); }
.claim {
  display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; column-gap: 13px;
  align-items: start;
  padding: 19px 0; border-bottom: 1px solid var(--rule);
}
.claim-mark { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 7px; background: var(--surface); color: var(--muted); }
.claim[data-status="proven"] .claim-mark { color: var(--verified); background: var(--verified-soft); }
.claim[data-status="disproven"] .claim-mark { color: var(--failed); background: var(--failed-soft); }
.claim h3 { margin: 2px 0 4px; font-size: 1rem; line-height: 1.38; text-wrap: pretty; }
.claim-id { font-family: var(--mono); color: var(--muted); font-size: 11px; }
.claim p { margin: 7px 0 0; max-width: 76ch; color: var(--muted); }
.evidence-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.evidence-link { font-family: var(--mono); font-size: 11px; color: var(--proof-blue-deep); text-decoration: none; padding: 3px 6px; background: var(--surface); border-radius: 4px; }
.data-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.data-table th { padding: 9px 10px; text-align: left; color: var(--muted); background: var(--surface); font-size: 12px; font-weight: 680; }
.data-table td { padding: 12px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; overflow-wrap: anywhere; }
.data-table th:first-child, .data-table td:first-child { padding-left: 0; }
.data-table th:last-child, .data-table td:last-child { padding-right: 0; }
.finding-title { font-weight: 650; }
.finding-description { margin-top: 3px; color: var(--muted); font-size: 13px; }
.mono { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }
.evidence-list { border-top: 1px solid var(--rule); }
.evidence-item { border-bottom: 1px solid var(--rule); }
.evidence-item summary {
  min-height: 58px; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto auto; gap: 12px;
  align-items: center; padding: 10px 0; cursor: pointer; list-style: none;
}
.evidence-item summary::-webkit-details-marker { display: none; }
.evidence-item summary::after { content: "+"; font-size: 18px; color: var(--muted); }
.evidence-item[open] summary::after { content: "−"; }
.evidence-summary strong { display: block; }
.evidence-summary span { display: block; color: var(--muted); font-size: 12px; }
.evidence-body { padding: 0 0 20px 40px; }
.metadata { display: flex; flex-wrap: wrap; gap: 7px 20px; margin: 0 0 13px; color: var(--muted); font-size: 12px; }
.metadata dt { font-weight: 650; }
.metadata dd { margin: 0; font-family: var(--mono); color: var(--ink); }
pre {
  max-height: 430px; margin: 10px 0 0; padding: 14px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--ink); background: var(--surface); border-radius: 7px; font: 12px/1.6 var(--mono); tab-size: 2;
}
.empty { padding: 24px 0; color: var(--muted); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.integrity-grid { display: grid; grid-template-columns: minmax(220px, .65fr) minmax(0, 1.35fr); gap: 28px; }
.integrity-status { padding: 20px; background: var(--surface); border-radius: 12px; }
.integrity-status strong { display: block; font-size: 1.08rem; }
.integrity-status p { margin: 6px 0 0; color: var(--muted); }
.digest-list { margin: 0; }
.digest-row { display: grid; grid-template-columns: 145px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--rule); }
.digest-row dt { color: var(--muted); font-size: 12px; }
.digest-row dd { margin: 0; font: 11px/1.5 var(--mono); overflow-wrap: anywhere; }
.copy {
  width: 34px; height: 34px; display: grid; place-items: center; color: var(--muted); background: transparent;
  border: 0; border-radius: 7px; cursor: pointer;
}
.copy:hover { color: var(--proof-blue-deep); background: var(--surface); }
.copy[data-copied="true"] { color: var(--verified); }
.hidden { display: none !important; }
.footer { padding: 20px clamp(22px, 4.5vw, 68px) 34px; color: var(--muted); border-top: 1px solid var(--rule); font-size: 12px; }

@media (max-width: 900px) {
  :root { --rail: 0px; }
  .shell { display: block; }
  .rail { position: sticky; z-index: 30; top: 0; width: 100%; height: auto; display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-right: 0; border-bottom: 1px solid var(--rule); overflow-x: auto; }
  .rail { scrollbar-width: none; overscroll-behavior-x: contain; }
  .rail::-webkit-scrollbar { display: none; }
  .brand { margin: 0 8px 0 0; white-space: nowrap; }
  .rail nav { display: flex; gap: 3px; }
  .rail nav a { white-space: nowrap; }
  .rail-meta { display: none; }
  .hero { padding-top: 25px; }
  .hero-row { display: block; }
  .hero-actions { justify-content: flex-start; margin-top: 18px; }
  .graph-layout, .integrity-grid { grid-template-columns: 1fr; }
}

@media (max-width: 1320px) {
  .graph-layout { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  .brand span:last-child { display: none; }
  .rail nav a { padding-inline: 8px; font-size: 13px; }
  .hero h1 { font-size: 1.55rem; }
  .verdict-symbol { width: 38px; height: 38px; }
  .metric { min-width: 50%; margin: 0; padding: 12px 10px 12px 0; border-bottom: 1px solid var(--rule); }
  .metric + .metric { padding-left: 10px; }
  .claim { grid-template-columns: 30px minmax(0, 1fr); }
  .claim > .status { grid-column: 2; margin-top: 10px; }
  .section-head { display: block; }
  .section-head .toolbar { margin-top: 14px; }
  .filter { max-width: 100%; }
  .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
  .data-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .data-table tr { padding: 12px 0; border-bottom: 1px solid var(--rule); }
  .data-table td { display: grid; grid-template-columns: 105px minmax(0, 1fr); gap: 10px; padding: 5px 0; border: 0; }
  .data-table td::before { content: attr(data-label); color: var(--muted); font-size: 12px; font-weight: 650; }
  .evidence-body { padding-left: 0; }
  .digest-row { grid-template-columns: 1fr auto; }
  .digest-row dd { grid-column: 1 / -1; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
}

@media print {
  .rail, .hero-actions, .toolbar, .copy, .skip-link { display: none !important; }
  .shell { display: block; }
  .hero, .main, .footer { padding-left: 0; padding-right: 0; }
  .section { break-inside: avoid; }
  .evidence-item:not([open]) .evidence-body { display: block; }
  pre { max-height: none; white-space: pre-wrap; }
  a { color: inherit; text-decoration: none; }
}
`;
