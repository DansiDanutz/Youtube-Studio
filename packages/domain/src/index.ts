export const stageOrder = ["brief", "script", "review"] as const;

export type Stage = (typeof stageOrder)[number];

export type RunStatus = "in_progress" | "awaiting_review" | "approved" | "rejected";

export type ReviewDecisionStage = "brief" | "script" | "final";

export type ReviewDecisionResult = "approved" | "rejected";

export type RunMode = "deterministic" | "provider";

export type BriefNormalizationSource = "local" | "openai";

export type ScriptGenerationSource = "deterministic" | "openai";

export type ReviewReason =
  | "factual_issue"
  | "weak_hook"
  | "poor_narration"
  | "poor_visual_alignment"
  | "caption_problem"
  | "pacing_problem"
  | "render_defect"
  | "policy_or_brand_issue"
  | "not_applicable";

export type FailureCode =
  | "BRIEF_TOPIC_MISSING"
  | "BRIEF_FACT_PACK_MISSING"
  | "BRIEF_STYLE_PRESET_MISSING"
  | "PROVIDER_CONFIG_MISSING"
  | "PROVIDER_REQUEST_FAILED"
  | "PROVIDER_SCHEMA_INVALID"
  | "SCRIPT_FACT_COVERAGE_FAILED"
  | "RUN_NOT_FOUND";

export interface FactPackItem {
  id: string;
  claim: string;
  source: string;
}

export interface BriefInput {
  topic: string;
  audience: string;
  desiredTakeaway: string;
  factPack: FactPackItem[];
  stylePreset: string;
  sourceNotes?: string[];
  bannedClaims?: string[];
}

export interface Brief extends BriefInput {
  platformPreset: "youtube_shorts_vertical";
}

export interface ScriptLine {
  section: "hook" | "beat" | "payoff";
  text: string;
  factIds: string[];
}

export interface ScriptScene {
  id: string;
  lineIndex: number;
  section: ScriptLine["section"];
  narration: string;
  visualPrompt: string;
  factIds: string[];
}

export interface ScriptDraft {
  title: string;
  narrationTargetSeconds: number;
  lines: ScriptLine[];
}

export interface Script extends ScriptDraft {
  claims: Array<{
    lineIndex: number;
    text: string;
    factIds: string[];
  }>;
  scenes: ScriptScene[];
}

export interface ArtifactRecord {
  kind: "brief" | "script" | "review";
  path: string;
}

export interface RunRecord {
  id: string;
  topic: string;
  status: RunStatus;
  currentStage: Stage;
  createdAt: string;
  updatedAt: string;
}

export interface StageExecutionRecord {
  runId: string;
  stage: Stage;
  status: "succeeded" | "failed";
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  failureCode: FailureCode | null;
}

export interface ReviewDecisionRecord {
  runId: string;
  stage: ReviewDecisionStage;
  decision: ReviewDecisionResult;
  reason: ReviewReason;
  comment: string;
  decidedAt: string;
}

export interface ReviewSummary {
  runId: string;
  topic: string;
  status: RunStatus;
  metadata: {
    mode: RunMode;
    briefNormalization: BriefNormalizationSource;
    scriptGeneration: ScriptGenerationSource;
    model: string | null;
    groundingStatus: "verified" | "not_applicable";
  };
  checks: Array<{
    label: string;
    status: "pass" | "warn";
    note: string;
  }>;
  artifacts: ArtifactRecord[];
}

export class DomainError extends Error {
  readonly failureCode: FailureCode;

  constructor(failureCode: FailureCode, message: string) {
    super(message);
    this.failureCode = failureCode;
  }
}

export function assertUnreachable(value: never): never {
  throw new Error(`Unreachable value: ${String(value)}`);
}
