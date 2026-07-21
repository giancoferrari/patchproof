export const PROOF_SCHEMA_VERSION = "1.0" as const;

export type Severity = "info" | "warning" | "blocking";
export type VerdictStatus = "verified" | "rejected" | "incomplete" | "error";
export type EvidenceStatus = "passed" | "failed" | "skipped" | "error";
export type ClaimStatus = "proven" | "disproven" | "unproven";
export type ChangeKind = "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";

export interface FileChange {
  path: string;
  previousPath?: string;
  kind: ChangeKind;
  additions: number;
  deletions: number;
  binary: boolean;
  patch?: string;
}

export interface PatchStats {
  filesChanged: number;
  additions: number;
  deletions: number;
  testFilesChanged: number;
}

export interface PatchSnapshot {
  repositoryRoot: string;
  repositoryName: string;
  branch: string | null;
  baseRef: string;
  headRef: string;
  baseCommit: string;
  headCommit: string;
  diff: string;
  diffDigest: string;
  files: FileChange[];
  stats: PatchStats;
}

export interface CommandSpec {
  id: string;
  run: string;
  description?: string;
  timeoutMs: number;
  required: boolean;
  cwd?: string;
  env?: Record<string, string>;
  inheritEnv?: string[];
}

export interface ScopePolicy {
  allowed: string[];
  denied: string[];
}

export interface ThresholdPolicy {
  maxChangedFiles: number;
  maxChangedLines: number;
  requireTestsForSourceChanges: boolean;
}

export interface RulePolicy {
  policyIntegrity: boolean;
  testIntegrity: boolean;
  secretScan: boolean;
  dependencyReview: boolean;
  scope: boolean;
  diffSize: boolean;
}

export interface ModelPolicy {
  provider: "none" | "ollama" | "openai-compatible";
  model?: string;
  endpoint?: string;
  apiKeyEnv?: string;
}

export interface PatchProofPolicy {
  version: 1;
  commands: CommandSpec[];
  scope: ScopePolicy;
  thresholds: ThresholdPolicy;
  rules: RulePolicy;
  model: ModelPolicy;
  redactions: string[];
}

export interface ClaimEvidenceRequirement {
  commands?: string[];
  rules?: string[];
  paths?: string[];
  requireTestChange?: boolean;
}

export interface ClaimDefinition {
  id: string;
  statement: string;
  severity: Severity;
  evidence: ClaimEvidenceRequirement;
}

export interface PatchContract {
  version: 1;
  id: string;
  title: string;
  task?: string;
  claims: ClaimDefinition[];
  outOfScope: string[];
}

export interface FindingLocation {
  path: string;
  line?: number;
  column?: number;
}

export interface Finding {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  location?: FindingLocation;
  relatedFiles: string[];
  fingerprint: string;
  remediation?: string;
}

export interface EvidenceRecord {
  id: string;
  type: "command" | "rule" | "artifact" | "human" | "model";
  producer: string;
  status: EvidenceStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  details?: string;
  command?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  relatedFiles: string[];
  metadata: Record<string, unknown>;
  previousDigest: string | null;
  digest: string;
}

export interface EvaluatedClaim extends ClaimDefinition {
  status: ClaimStatus;
  evidenceIds: string[];
  findingIds: string[];
  explanation: string;
}

export interface AnalyzerResult {
  evidence: Omit<EvidenceRecord, "previousDigest" | "digest">[];
  findings: Finding[];
}

export interface AnalyzerContext {
  patch: PatchSnapshot;
  policy: PatchProofPolicy;
  contract: PatchContract;
  getFileAtRef(ref: string, path: string): Promise<string | null>;
}

export interface Analyzer {
  id: string;
  analyze(context: AnalyzerContext): Promise<AnalyzerResult>;
}

export interface PolicySeal {
  source: "base-commit" | "working-tree" | "explicit-file";
  sourceRef: string;
  path: string;
  digest: string;
}

export interface ProofVerdict {
  status: VerdictStatus;
  summary: string;
  blockingFindings: number;
  warnings: number;
  provenClaims: number;
  disprovenClaims: number;
  unprovenClaims: number;
  requiredCommandsPassed: number;
  requiredCommandsTotal: number;
}

export interface ProofAttestation {
  algorithm: "Ed25519";
  publicKey: string;
  signedDigest: string;
  signature: string;
  createdAt: string;
  keyId: string;
}

export interface ProofBundle {
  schemaVersion: typeof PROOF_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  generator: {
    name: "patchproof";
    version: string;
    node: string;
    platform: string;
  };
  patch: PatchSnapshot;
  policy: {
    seal: PolicySeal;
    value: PatchProofPolicy;
  };
  contract: {
    digest: string;
    value: PatchContract;
  };
  evidence: EvidenceRecord[];
  findings: Finding[];
  claims: EvaluatedClaim[];
  verdict: ProofVerdict;
  chainDigest: string;
  contentDigest: string;
  attestation?: ProofAttestation;
}

export interface VerificationOptions {
  cwd: string;
  baseRef: string;
  headRef: string;
  policyPath: string;
  contractPath: string;
  runCommands: boolean;
  explicitPolicy: boolean;
  packageVersion: string;
}

export interface ModelContractRequest {
  task: string;
  repositorySummary?: string;
  provider: ModelPolicy;
}

export interface ContractModel {
  readonly name: string;
  generateContract(request: ModelContractRequest): Promise<PatchContract>;
}
