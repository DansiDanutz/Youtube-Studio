import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StrictVideoPipelineManifest, VideoPipelineStageKey } from "./schemas.js";
import { assertNoSecrets, sanitizeForManifest } from "./no-secret.js";
import type { VideoPipelineRuntimeDryRunResult, VideoPipelineRuntimePlan } from "./runtime-adapters.js";

export type VideoPipelineQualityCheckKey =
  | "technical_render_validation"
  | "visual_consistency"
  | "audio_subtitle_sync"
  | "creative_semantic_alignment"
  | "regeneration_loop_readiness"
  | "release_readiness";

export type VideoPipelineQualityStatus = "planned" | "quality_ready_for_live_execution" | "regeneration_required";

export interface VideoPipelineQualityCheck {
  key: VideoPipelineQualityCheckKey;
  label: string;
  required: boolean;
  stageKeys: VideoPipelineStageKey[];
  metricTargets: Record<string, number | string | boolean>;
  rollbackStageKey: VideoPipelineStageKey;
}

export interface VideoPipelineRegenerationPolicy {
  maxLoops: number;
  loopTriggers: string[];
  escalationAfterLoops: string;
}

export interface VideoPipelineQualityPlan {
  runId: string;
  status: "planned";
  createdAt: string;
  minimumCompositeScore: number;
  checks: VideoPipelineQualityCheck[];
  regenerationPolicy: VideoPipelineRegenerationPolicy;
  qualityGuards: string[];
}

export interface VideoPipelineQualityDryRunResult {
  runId: string;
  status: Exclude<VideoPipelineQualityStatus, "planned">;
  compositeScore: number;
  passedCheckCount: number;
  failedCheckCount: number;
  paths: {
    qualityPlan: string;
    technicalReport: string;
    visualConsistencyReport: string;
    audioSubtitleSyncReport: string;
    creativeSemanticReport: string;
    regenerationPlan: string;
    releaseReadiness: string;
  };
}

interface CheckReport {
  key: VideoPipelineQualityCheckKey;
  passed: boolean;
  score: number;
  findings: string[];
  rollbackStageKey: VideoPipelineStageKey;
}

export function createVideoPipelineQualityPlan(
  manifest: StrictVideoPipelineManifest,
  runtimePlan: VideoPipelineRuntimePlan,
  now = new Date()
): VideoPipelineQualityPlan {
  assertNoSecrets(manifest);
  assertNoSecrets(runtimePlan);
  const plan: VideoPipelineQualityPlan = {
    runId: manifest.runId,
    status: "planned",
    createdAt: now.toISOString(),
    minimumCompositeScore: 9.5,
    checks: buildQualityChecks(),
    regenerationPolicy: {
      maxLoops: 3,
      loopTriggers: [
        "composite_score_below_9_5",
        "technical_render_validation_failed",
        "audio_subtitle_sync_failed",
        "visual_consistency_failed",
        "creative_semantic_alignment_failed",
        "manifest_or_runtime_blocked"
      ],
      escalationAfterLoops: "Escalate to Hermes senior review and Paperclip if three regeneration loops cannot clear blocker evidence."
    },
    qualityGuards: [
      "Phase 4 is still dry-run proof until live render artifacts exist.",
      "Every final render must pass ffprobe-style technical validation before release.",
      "Creative and semantic QA must confirm prompt alignment, factual safety, style consistency, pacing, and hook strength.",
      "Audio/subtitle sync must be validated before dashboard or Paperclip release proof.",
      "Any failed required check creates an explicit rollback/regeneration action instead of silent release."
    ]
  };
  return sanitizeForManifest(plan);
}

export function executeVideoPipelineQualityDryRun(
  rootDir: string,
  manifest: StrictVideoPipelineManifest,
  runtime: VideoPipelineRuntimeDryRunResult,
  plan = createVideoPipelineQualityPlan(manifest, createSyntheticRuntimePlan(manifest, runtime))
): VideoPipelineQualityDryRunResult {
  assertNoSecrets(manifest);
  assertNoSecrets(runtime);
  assertNoSecrets(plan);

  const outputRoot = join(rootDir, manifest.outputDir);
  const paths = {
    qualityPlan: join(outputRoot, "qa", "quality-plan.json"),
    technicalReport: join(outputRoot, "qa", "technical-report.json"),
    visualConsistencyReport: join(outputRoot, "qa", "visual-consistency-report.json"),
    audioSubtitleSyncReport: join(outputRoot, "qa", "audio-subtitle-sync-report.json"),
    creativeSemanticReport: join(outputRoot, "qa", "creative-semantic-report.json"),
    regenerationPlan: join(outputRoot, "qa", "regeneration-plan.json"),
    releaseReadiness: join(outputRoot, "qa", "release-readiness.json")
  };

  const reports = evaluateQualityChecks(manifest, runtime, plan);
  const compositeScore = roundToSingleDecimal((reports.reduce((sum, report) => sum + report.score, 0) / reports.length) * 10);
  const passedCheckCount = reports.filter((report) => report.passed).length;
  const failedReports = reports.filter((report) => !report.passed);
  const status = failedReports.length === 0 && compositeScore >= plan.minimumCompositeScore ? "quality_ready_for_live_execution" : "regeneration_required";
  const regenerationPlan = buildRegenerationPlan(manifest, plan, failedReports, compositeScore);
  const releaseReadiness = {
    runId: manifest.runId,
    releasable: status === "quality_ready_for_live_execution",
    compositeScore,
    minimumCompositeScore: plan.minimumCompositeScore,
    finalBlockers: failedReports.flatMap((report) => report.findings),
    requiredProof: [
      "technical_report",
      "visual_consistency_report",
      "audio_subtitle_sync_report",
      "creative_semantic_report",
      "regeneration_plan",
      "runtime_execution_report",
      "no_secret_scan"
    ],
    note:
      status === "quality_ready_for_live_execution"
        ? "Phase 4 dry-run QA gates are clear. Live execution may proceed after operator approval and real adapter health checks."
        : "Required QA gates failed or upstream manifest/runtime is blocked. Execute regeneration actions before live rendering."
  };

  writeJson(paths.qualityPlan, plan);
  writeJson(paths.technicalReport, buildReportPayload(manifest, reports, "technical_render_validation"));
  writeJson(paths.visualConsistencyReport, buildReportPayload(manifest, reports, "visual_consistency"));
  writeJson(paths.audioSubtitleSyncReport, buildReportPayload(manifest, reports, "audio_subtitle_sync"));
  writeJson(paths.creativeSemanticReport, buildReportPayload(manifest, reports, "creative_semantic_alignment"));
  writeJson(paths.regenerationPlan, regenerationPlan);
  writeJson(paths.releaseReadiness, releaseReadiness);

  return {
    runId: manifest.runId,
    status,
    compositeScore,
    passedCheckCount,
    failedCheckCount: failedReports.length,
    paths
  };
}

function buildQualityChecks(): VideoPipelineQualityCheck[] {
  return [
    {
      key: "technical_render_validation",
      label: "Technical render validation",
      required: true,
      stageKeys: ["render_platform_exports", "technical_qa"],
      metricTargets: { ffprobeRequired: true, minimumResolution: "1080p", targetFps: 30, audioLoudnessLufs: -14, container: "mp4" },
      rollbackStageKey: "render_platform_exports"
    },
    {
      key: "visual_consistency",
      label: "Visual consistency and style bible validation",
      required: true,
      stageKeys: ["visual_identity_style_bible", "asset_generation", "scene_clip_generation", "creative_semantic_qa"],
      metricTargets: { styleBibleRequired: true, shotContinuityMinimum: 0.95, brandConsistencyMinimum: 0.95 },
      rollbackStageKey: "visual_identity_style_bible"
    },
    {
      key: "audio_subtitle_sync",
      label: "Audio/subtitle sync validation",
      required: true,
      stageKeys: ["voice_audio_design", "subtitles_overlays", "music_sfx_mix", "technical_qa"],
      metricTargets: { maxSubtitleDriftMs: 120, subtitlesRequired: true, voicePresetRequired: true },
      rollbackStageKey: "subtitles_overlays"
    },
    {
      key: "creative_semantic_alignment",
      label: "Creative and semantic alignment QA",
      required: true,
      stageKeys: ["job_contract_intent", "creative_strategy_hook", "script_pacing", "creative_semantic_qa"],
      metricTargets: { promptAlignmentMinimum: 0.96, hookStrengthMinimum: 0.95, factualSafetyRequired: true },
      rollbackStageKey: "creative_strategy_hook"
    },
    {
      key: "regeneration_loop_readiness",
      label: "Regeneration loop readiness",
      required: true,
      stageKeys: ["technical_qa", "creative_semantic_qa", "packaging_lineage_learning"],
      metricTargets: { rollbackActionsRequiredOnFailure: true, maxLoops: 3 },
      rollbackStageKey: "technical_qa"
    },
    {
      key: "release_readiness",
      label: "Release readiness proof gate",
      required: true,
      stageKeys: ["release_paperclip_monitoring"],
      metricTargets: { paperclipProofRequired: true, noSecretProofRequired: true, finalArtifactRequired: true },
      rollbackStageKey: "release_paperclip_monitoring"
    }
  ];
}

function evaluateQualityChecks(
  manifest: StrictVideoPipelineManifest,
  runtime: VideoPipelineRuntimeDryRunResult,
  plan: VideoPipelineQualityPlan
): CheckReport[] {
  const manifestBlocked = !manifest.score.releasable || manifest.gates.some((gate) => gate.severity === "blocker" || gate.severity === "critical");
  const runtimeBlocked = runtime.status !== "ready_for_runtime_execution";
  return plan.checks.map((check) => {
    const findings: string[] = [];
    if (manifestBlocked) {
      findings.push(`Manifest blocker prevents ${check.label}: fix prompt/cost/fallback gates before QA release.`);
    }
    if (runtimeBlocked) {
      findings.push(`Runtime status ${runtime.status} prevents ${check.label}.`);
    }
    if (check.key === "audio_subtitle_sync" && !manifest.input.subtitlesEnabled) {
      findings.push("Subtitles are disabled; best-on-market target requires subtitle/overlay sync proof.");
    }
    if (check.key === "creative_semantic_alignment" && manifest.input.prompt.trim().length < 40) {
      findings.push("Prompt is too short for high-confidence creative semantic alignment.");
    }
    const passed = findings.length === 0;
    return {
      key: check.key,
      passed,
      score: passed ? 1 : 0,
      findings,
      rollbackStageKey: check.rollbackStageKey
    };
  });
}

function buildRegenerationPlan(
  manifest: StrictVideoPipelineManifest,
  plan: VideoPipelineQualityPlan,
  failedReports: CheckReport[],
  compositeScore: number
) {
  const blockerActions = manifest.gates
    .filter((gate) => gate.severity === "blocker" || gate.severity === "critical")
    .map((gate) => ({ rollbackStageKey: gate.rollbackStageKey, reason: `${gate.code}: ${gate.message}` }));
  const checkActions = failedReports.map((report) => ({
    rollbackStageKey: report.rollbackStageKey,
    reason: report.findings.join(" ") || `${report.key} failed below required threshold.`
  }));
  const actions = dedupeActions([...blockerActions, ...checkActions]);
  return {
    runId: manifest.runId,
    compositeScore,
    minimumCompositeScore: plan.minimumCompositeScore,
    loopsRequired: actions.length === 0 ? 0 : Math.min(plan.regenerationPolicy.maxLoops, Math.max(1, actions.length)),
    maxLoops: plan.regenerationPolicy.maxLoops,
    triggers: actions.length === 0 ? [] : plan.regenerationPolicy.loopTriggers,
    actions,
    status: actions.length === 0 ? "no_regeneration_required" : "regeneration_required"
  };
}

function buildReportPayload(manifest: StrictVideoPipelineManifest, reports: CheckReport[], key: VideoPipelineQualityCheckKey) {
  const report = reports.find((candidate) => candidate.key === key);
  return {
    runId: manifest.runId,
    key,
    passed: report?.passed ?? false,
    score: report?.score ?? 0,
    findings: report?.findings ?? ["Missing QA report."],
    proofMode: "phase4_dry_run",
    note: "Live media probes attach measured evidence here during Phase 5; Phase 4 validates the gate contract, scoring, rollback, and no-secret artifact flow."
  };
}

function dedupeActions(actions: Array<{ rollbackStageKey: VideoPipelineStageKey; reason: string }>) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.rollbackStageKey}:${action.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createSyntheticRuntimePlan(manifest: StrictVideoPipelineManifest, runtime: VideoPipelineRuntimeDryRunResult): VideoPipelineRuntimePlan {
  return {
    runId: manifest.runId,
    mode: "dry_run",
    createdAt: manifest.createdAt,
    adapters: [],
    executionSteps: [],
    costLedger: { totalEstimatedUsd: 0, entries: [] },
    runtimeGuards: [`Runtime result status: ${runtime.status}`]
  };
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sanitizeForManifest(value), null, 2)}\n`, "utf8");
}
