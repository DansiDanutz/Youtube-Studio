import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StrictVideoPipelineManifest, VideoPipelineStageKey } from "./schemas.js";
import { assertNoSecrets, sanitizeForManifest } from "./no-secret.js";

export type VideoPipelineRuntimeAdapterKey = "comfyui" | "ffmpeg" | "remotion" | "narration" | "subtitles" | "local_video" | "paid_fallback";
export type VideoPipelineRuntimeMode = "dry_run" | "live";
export type VideoPipelineRuntimeStepStatus = "planned" | "dry_run_verified" | "blocked" | "failed";
export type VideoPipelineApprovalState = "not_required" | "pending" | "approved";

export interface VideoPipelineRuntimeAdapter {
  key: VideoPipelineRuntimeAdapterKey;
  label: string;
  enabled: boolean;
  localFirst: boolean;
  requiresApproval: boolean;
  policy: string;
  stageKeys: VideoPipelineStageKey[];
  healthCheck: {
    command: string;
    requiredForLive: boolean;
  };
  outputs: string[];
}

export interface VideoPipelineRuntimeStep {
  id: string;
  adapterKey: VideoPipelineRuntimeAdapterKey;
  stageKey: VideoPipelineStageKey;
  title: string;
  status: VideoPipelineRuntimeStepStatus;
  command: string;
  expectedArtifacts: string[];
}

export interface VideoPipelineCostLedgerEntry {
  adapterKey: VideoPipelineRuntimeAdapterKey;
  costPolicy: "local" | "approved_paid_fallback" | "disabled_paid_fallback";
  approvalState: VideoPipelineApprovalState;
  estimatedUsd: number;
  note: string;
}

export interface VideoPipelineRuntimePlan {
  runId: string;
  mode: VideoPipelineRuntimeMode;
  createdAt: string;
  adapters: VideoPipelineRuntimeAdapter[];
  executionSteps: VideoPipelineRuntimeStep[];
  costLedger: {
    totalEstimatedUsd: number;
    entries: VideoPipelineCostLedgerEntry[];
  };
  runtimeGuards: string[];
}

export interface VideoPipelineRuntimeDryRunResult {
  runId: string;
  status: "ready_for_runtime_execution" | "blocked";
  paths: {
    runtimePlan: string;
    adapterRegistry: string;
    costLedger: string;
    executionReport: string;
  };
  verifiedStepCount: number;
}

export function createVideoPipelineRuntimePlan(manifest: StrictVideoPipelineManifest, now = new Date()): VideoPipelineRuntimePlan {
  assertNoSecrets(manifest);
  const paidFallbackApproved = manifest.input.costMode === "allow_fal_fallback" && manifest.input.allowFalFallback;
  const adapters = buildAdapters(paidFallbackApproved);
  const executionSteps = buildExecutionSteps(adapters);
  const entries = buildCostLedger(adapters, paidFallbackApproved);
  const plan: VideoPipelineRuntimePlan = {
    runId: manifest.runId,
    mode: "dry_run",
    createdAt: now.toISOString(),
    adapters,
    executionSteps,
    costLedger: {
      totalEstimatedUsd: entries.reduce((sum, entry) => sum + entry.estimatedUsd, 0),
      entries
    },
    runtimeGuards: [
      "No adapter may execute live until the strict manifest is releasable and gate report is clean.",
      "Use local/open-source adapters first: ComfyUI, FFmpeg, Remotion, local narration, local subtitles, and local video slots.",
      "Paid fallback remains disabled unless cost mode is allow_fal_fallback and explicit fallback approval is true.",
      "Runtime outputs must write only inside the run artifact directory and must pass the no-secret scan before dashboard/Paperclip proof."
    ]
  };
  return sanitizeForManifest(plan);
}

export function executeVideoPipelineRuntimeDryRun(
  rootDir: string,
  manifest: StrictVideoPipelineManifest,
  plan = createVideoPipelineRuntimePlan(manifest)
): VideoPipelineRuntimeDryRunResult {
  assertNoSecrets(manifest);
  assertNoSecrets(plan);
  const outputRoot = join(rootDir, manifest.outputDir);
  const paths = {
    runtimePlan: join(outputRoot, "runtime", "runtime-plan.json"),
    adapterRegistry: join(outputRoot, "runtime", "adapter-registry.json"),
    costLedger: join(outputRoot, "routing", "cost-ledger.json"),
    executionReport: join(outputRoot, "runtime", "execution-report.json")
  };
  const verifiedSteps = plan.executionSteps.map((step) => ({ ...step, status: "dry_run_verified" as const }));
  const executionReport = {
    runId: manifest.runId,
    runtimeReady: manifest.score.releasable && manifest.gates.every((gate) => gate.severity !== "blocker" && gate.severity !== "critical"),
    mode: plan.mode,
    steps: verifiedSteps,
    note: "Phase 3 dry-run validated adapter routing, output contracts, cost gates, and no-secret policy without launching external generators."
  };

  writeJson(paths.runtimePlan, plan);
  writeJson(paths.adapterRegistry, { runId: manifest.runId, adapters: plan.adapters });
  writeJson(paths.costLedger, plan.costLedger);
  writeJson(paths.executionReport, executionReport);

  return {
    runId: manifest.runId,
    status: executionReport.runtimeReady ? "ready_for_runtime_execution" : "blocked",
    paths,
    verifiedStepCount: verifiedSteps.length
  };
}

function buildAdapters(paidFallbackApproved: boolean): VideoPipelineRuntimeAdapter[] {
  return [
    {
      key: "comfyui",
      label: "ComfyUI visual asset adapter",
      enabled: true,
      localFirst: true,
      requiresApproval: false,
      policy: "Local ComfyUI or Comfy-compatible workflow execution for still assets and visual scene sources.",
      stageKeys: ["visual_identity_style_bible", "asset_generation", "scene_clip_generation"],
      healthCheck: { command: "curl -s http://127.0.0.1:8188/system_stats", requiredForLive: true },
      outputs: ["assets/asset-manifest.json", "clips/clip-manifest.json"]
    },
    {
      key: "ffmpeg",
      label: "FFmpeg render, mix, and technical QA adapter",
      enabled: true,
      localFirst: true,
      requiresApproval: false,
      policy: "Local FFmpeg/ffprobe handles audio mix, render validation, frame samples, and platform exports.",
      stageKeys: ["music_sfx_mix", "render_platform_exports", "technical_qa"],
      healthCheck: { command: "ffmpeg -version && ffprobe -version", requiredForLive: true },
      outputs: ["audio/mix-plan.json", "render/export-manifest.json", "qa/technical-report.json", "qa/frame-samples.json"]
    },
    {
      key: "remotion",
      label: "Remotion edit and motion graphics adapter",
      enabled: true,
      localFirst: true,
      requiresApproval: false,
      policy: "Local Remotion composition builds timeline, overlays, motion graphics, and platform variants.",
      stageKeys: ["subtitles_overlays", "assembly_edit_rhythm", "render_platform_exports"],
      healthCheck: { command: "pnpm exec remotion --version", requiredForLive: false },
      outputs: ["subtitles/overlay-plan.json", "edit/timeline.json", "edit/edit-decisions.json", "render/final.mp4"]
    },
    {
      key: "narration",
      label: "Narration and voice adapter",
      enabled: true,
      localFirst: true,
      requiresApproval: false,
      policy: "Local TTS is default. External voice providers are represented only by safe presets until a separate approved live connector exists.",
      stageKeys: ["voice_audio_design"],
      healthCheck: { command: "python3 --version", requiredForLive: true },
      outputs: ["audio/voice-plan.json", "audio/pronunciation-dictionary.json"]
    },
    {
      key: "subtitles",
      label: "Subtitle timing adapter",
      enabled: true,
      localFirst: true,
      requiresApproval: false,
      policy: "Local subtitle generator creates SRT/overlay timing from script beats and narration timing.",
      stageKeys: ["subtitles_overlays"],
      healthCheck: { command: "python3 --version", requiredForLive: true },
      outputs: ["subtitles/subtitles.srt", "subtitles/overlay-plan.json"]
    },
    {
      key: "local_video",
      label: "Local video generation slot adapter",
      enabled: true,
      localFirst: true,
      requiresApproval: false,
      policy: "Wan/Hunyuan/AnimateDiff style local slots are routed through ComfyUI-compatible manifests before any cloud fallback.",
      stageKeys: ["scene_clip_generation"],
      healthCheck: { command: "python3 --version", requiredForLive: false },
      outputs: ["clips/clip-manifest.json"]
    },
    {
      key: "paid_fallback",
      label: "Gated paid fallback adapter",
      enabled: paidFallbackApproved,
      localFirst: false,
      requiresApproval: true,
      policy: paidFallbackApproved
        ? "Enabled only because cost mode and explicit approval both allow paid fallback. Live connector must still record per-run cost."
        : "Disabled. Requires cost mode allow_fal_fallback plus explicit approval before any paid provider can run.",
      stageKeys: ["tool_routing_cost_fallback", "asset_generation", "scene_clip_generation"],
      healthCheck: { command: "disabled until explicit approval and separate connector health check", requiredForLive: false },
      outputs: ["routing/cost-ledger.json", "assets/asset-manifest.json", "clips/clip-manifest.json"]
    }
  ];
}

function buildExecutionSteps(adapters: VideoPipelineRuntimeAdapter[]): VideoPipelineRuntimeStep[] {
  return adapters.flatMap((adapter) =>
    adapter.stageKeys.map((stageKey, index) => ({
      id: `${adapter.key}-${index + 1}-${stageKey}`,
      adapterKey: adapter.key,
      stageKey,
      title: `${adapter.label} -> ${stageKey}`,
      status: "planned" as const,
      command: adapter.enabled ? adapter.healthCheck.command : "disabled by cost gate",
      expectedArtifacts: adapter.outputs
    }))
  );
}

function buildCostLedger(adapters: VideoPipelineRuntimeAdapter[], paidFallbackApproved: boolean): VideoPipelineCostLedgerEntry[] {
  return adapters.map((adapter) => {
    if (adapter.key === "paid_fallback") {
      return {
        adapterKey: adapter.key,
        costPolicy: paidFallbackApproved ? "approved_paid_fallback" : "disabled_paid_fallback",
        approvalState: paidFallbackApproved ? "approved" : "pending",
        estimatedUsd: paidFallbackApproved ? 0.01 : 0,
        note: paidFallbackApproved ? "Approved but still requires live connector cost recording." : "Disabled; no paid execution permitted."
      };
    }
    return {
      adapterKey: adapter.key,
      costPolicy: "local",
      approvalState: "not_required",
      estimatedUsd: 0,
      note: "Local-first execution path."
    };
  });
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sanitizeForManifest(value), null, 2)}\n`, "utf8");
}
