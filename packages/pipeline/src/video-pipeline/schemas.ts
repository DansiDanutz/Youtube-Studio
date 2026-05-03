export type VideoPipelineCostMode = "local_first" | "local_only" | "allow_fal_fallback";
export type StrictStageStatus = "pending" | "running" | "locked" | "looping" | "failed";
export type GateSeverity = "info" | "warn" | "blocker" | "critical";
export type ReleaseTargetTier = "draft" | "good" | "production" | "best_on_market";
export type ReleaseTier = ReleaseTargetTier | "blocked";

export interface StrictVideoPipelineInput {
  prompt: string;
  videoLengthSeconds: number;
  subtitlesEnabled: boolean;
  language: string;
  voicePreset: string;
  costMode: VideoPipelineCostMode;
  allowFalFallback: boolean;
  designSystem?: string;
}

export type VideoPipelineStageKey =
  | "job_contract_intent"
  | "research_factual_grounding"
  | "creative_strategy_hook"
  | "script_pacing"
  | "visual_identity_style_bible"
  | "storyboard_shot_architecture"
  | "tool_routing_cost_fallback"
  | "asset_generation"
  | "voice_audio_design"
  | "subtitles_overlays"
  | "scene_clip_generation"
  | "assembly_edit_rhythm"
  | "music_sfx_mix"
  | "render_platform_exports"
  | "technical_qa"
  | "creative_semantic_qa"
  | "packaging_lineage_learning"
  | "release_paperclip_monitoring";

export interface StageDefinition {
  index: number;
  key: VideoPipelineStageKey;
  title: string;
  objective: string;
  gate: string;
  requiredArtifacts: string[];
  tools: string[];
  weight: number;
  rollbackOnFailure: VideoPipelineStageKey;
}

export interface VideoPipelineGateResult {
  stageKey: VideoPipelineStageKey;
  code: string;
  message: string;
  severity: GateSeverity;
  rollbackStageKey: VideoPipelineStageKey;
}

export interface StrictVideoPipelineStage extends StageDefinition {
  status: StrictStageStatus;
  gateResults: VideoPipelineGateResult[];
  normalizedScore: number;
}

export interface VideoPipelineArtifactContract {
  outputDir: string;
  requiredDirectories: string[];
  requiredFiles: string[];
  optionalFiles: string[];
  finalVideoPath: string;
}

export interface VideoPipelineStageScore {
  stageKey: VideoPipelineStageKey;
  normalizedScore: number;
}

export interface ScoreBlocker {
  severity: GateSeverity;
  code: string;
  message: string;
  stageKey: VideoPipelineStageKey;
}

export interface WeightedScoreInput {
  stageScores: VideoPipelineStageScore[];
  blockers: ScoreBlocker[];
  targetTier: ReleaseTargetTier;
}

export interface WeightedScoreResult {
  weightedScore: number;
  targetTier: ReleaseTargetTier;
  tier: ReleaseTier;
  releasable: boolean;
  blockers: ScoreBlocker[];
}

export interface StrictVideoPipelineManifest {
  runId: string;
  createdAt: string;
  outputDir: string;
  releaseTarget: ReleaseTargetTier;
  input: StrictVideoPipelineInput;
  stages: StrictVideoPipelineStage[];
  gates: VideoPipelineGateResult[];
  score: WeightedScoreResult;
  artifactContract: VideoPipelineArtifactContract;
  noSecretPolicy: string;
  finalVideoPath: string;
}
