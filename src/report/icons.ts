import type { ClaimStatus, EvidenceStatus, Severity, VerdictStatus } from "../types.js";

const paths = {
  verified: '<path d="M20 6 9 17l-5-5"/><path d="M21 12a9 9 0 1 1-5.3-8.2"/>',
  rejected: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6m0-6 6 6"/>',
  incomplete: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  terminal: '<path d="m4 7 4 4-4 4m6 0h6"/><rect x="2" y="3" width="20" height="18" rx="2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
} as const;

export type IconName = keyof typeof paths;

export function icon(name: IconName, label?: string): string {
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="icon" ${aria} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

export function verdictIcon(status: VerdictStatus): string {
  if (status === "verified") return icon("verified");
  if (status === "rejected" || status === "error") return icon("rejected");
  return icon("incomplete");
}

export function claimIcon(status: ClaimStatus): string {
  if (status === "proven") return icon("verified");
  if (status === "disproven") return icon("rejected");
  return icon("incomplete");
}

export function evidenceIcon(status: EvidenceStatus): string {
  if (status === "passed") return icon("verified");
  if (status === "failed" || status === "error") return icon("rejected");
  return icon("incomplete");
}

export function severityIcon(severity: Severity): string {
  if (severity === "blocking") return icon("rejected");
  if (severity === "warning") return icon("incomplete");
  return icon("info");
}
