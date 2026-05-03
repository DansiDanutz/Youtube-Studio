import type { StrictVideoPipelineManifest, VideoPipelineGateResult } from "../../../packages/pipeline/src/index.js";

export interface VideoPipelineCockpitTimelineItem {
  index: number;
  key: string;
  title: string;
  gate: string;
  status: string;
  artifactCount: number;
  gateCount: number;
  normalizedScore: number;
  requiredArtifacts: string[];
}

export interface VideoPipelineCockpitArtifactLink {
  label: string;
  path: string;
  kind: "manifest" | "contract" | "research" | "qa" | "render" | "artifact";
}

export interface VideoPipelineCockpitPayload {
  runId: string;
  controls: {
    prompt: string;
    videoLengthSeconds: number;
    subtitlesEnabled: boolean;
    language: string;
    voicePreset: string;
    costMode: string;
    allowFalFallback: boolean;
    designSystem: string;
  };
  score: StrictVideoPipelineManifest["score"];
  timeline: VideoPipelineCockpitTimelineItem[];
  artifactLinks: VideoPipelineCockpitArtifactLink[];
  operatorWarnings: string[];
  nextActions: string[];
}

export function createVideoPipelineCockpitPayload(
  manifest: StrictVideoPipelineManifest,
  artifacts: Record<string, string>,
  runtimeArtifacts: Record<string, string> = {},
  qualityArtifacts: Record<string, string> = {},
  liveArtifacts: Record<string, string> = {}
): VideoPipelineCockpitPayload {
  const operatorWarnings = buildOperatorWarnings(manifest.gates);
  return {
    runId: manifest.runId,
    controls: {
      prompt: manifest.input.prompt,
      videoLengthSeconds: manifest.input.videoLengthSeconds,
      subtitlesEnabled: manifest.input.subtitlesEnabled,
      language: manifest.input.language,
      voicePreset: manifest.input.voicePreset,
      costMode: manifest.input.costMode,
      allowFalFallback: manifest.input.allowFalFallback,
      designSystem: manifest.input.designSystem ?? "cinematic premium editorial system"
    },
    score: manifest.score,
    timeline: manifest.stages.map((stage) => ({
      index: stage.index,
      key: stage.key,
      title: stage.title,
      gate: stage.gate,
      status: stage.status,
      artifactCount: stage.requiredArtifacts.length,
      gateCount: stage.gateResults.length,
      normalizedScore: stage.normalizedScore,
      requiredArtifacts: stage.requiredArtifacts
    })),
    artifactLinks: buildArtifactLinks(manifest, artifacts, runtimeArtifacts, qualityArtifacts, liveArtifacts),
    operatorWarnings,
    nextActions: buildNextActions(manifest, operatorWarnings)
  };
}

function buildArtifactLinks(
  manifest: StrictVideoPipelineManifest,
  artifacts: Record<string, string>,
  runtimeArtifacts: Record<string, string>,
  qualityArtifacts: Record<string, string>,
  liveArtifacts: Record<string, string>
): VideoPipelineCockpitArtifactLink[] {
  const links: VideoPipelineCockpitArtifactLink[] = [
    { label: "Pipeline manifest", path: artifacts.manifest, kind: "manifest" },
    { label: "Job contract", path: artifacts.jobContract, kind: "contract" },
    { label: "Gate report", path: artifacts.gateReport, kind: "qa" },
    { label: "Citation registry", path: artifacts.citationRegistry, kind: "research" },
    { label: "Fact pack", path: artifacts.factPack, kind: "research" },
    { label: "Runtime adapter plan", path: runtimeArtifacts.runtimePlan, kind: "artifact" },
    { label: "Adapter registry", path: runtimeArtifacts.adapterRegistry, kind: "artifact" },
    { label: "Runtime execution report", path: runtimeArtifacts.executionReport, kind: "qa" },
    { label: "Phase 4 quality plan", path: qualityArtifacts.qualityPlan, kind: "qa" },
    { label: "Technical QA report", path: qualityArtifacts.technicalReport, kind: "qa" },
    { label: "Visual consistency report", path: qualityArtifacts.visualConsistencyReport, kind: "qa" },
    { label: "Audio/subtitle sync report", path: qualityArtifacts.audioSubtitleSyncReport, kind: "qa" },
    { label: "Creative semantic QA report", path: qualityArtifacts.creativeSemanticReport, kind: "qa" },
    { label: "Regeneration plan", path: qualityArtifacts.regenerationPlan, kind: "qa" },
    { label: "Phase 4 release readiness", path: qualityArtifacts.releaseReadiness, kind: "qa" },
    { label: "Phase 5 final video", path: liveArtifacts.finalVideo, kind: "render" },
    { label: "Phase 5 measured QA report", path: liveArtifacts.measuredQaReport, kind: "qa" },
    { label: "Phase 5 ffprobe report", path: liveArtifacts.ffprobeReport, kind: "qa" },
    { label: "Phase 5 release readiness", path: liveArtifacts.releaseReadiness, kind: "qa" },
    { label: "Phase 5 live execution report", path: liveArtifacts.liveExecutionReport, kind: "qa" },
    { label: "Phase 5 actual cost ledger", path: liveArtifacts.costLedger, kind: "artifact" },
    { label: "Final video target", path: manifest.finalVideoPath, kind: "render" }
  ];
  return links.filter((link) => Boolean(link.path));
}

function buildOperatorWarnings(gates: VideoPipelineGateResult[]): string[] {
  return gates
    .filter((gate) => gate.severity === "blocker" || gate.severity === "critical")
    .map((gate) => `${gate.code}: ${gate.message}`);
}

function buildNextActions(manifest: StrictVideoPipelineManifest, operatorWarnings: string[]): string[] {
  if (operatorWarnings.length > 0) {
    return [
      "Fix blocker gates in the dashboard controls before starting generation.",
      "Re-run the strict cockpit request and verify score is releasable before runtime adapters execute."
    ];
  }
  if (!manifest.score.releasable) {
    return [
      "Improve stage inputs until the weighted score reaches the target tier.",
      "Do not start render/release until the gate report is clean."
    ];
  }
  return [
    "Review Phase 4 quality plan, release-readiness proof, and regeneration plan before any live render.",
    "When operator approves live execution, run ComfyUI, FFmpeg, Remotion, narration, subtitles, and local video adapters in manifest order.",
    "After live render, replace dry-run QA placeholders with measured ffprobe, frame, audio/subtitle, and creative semantic evidence.",
    "Keep paid fallback disabled unless explicit cost approval is present and logged in the cost ledger."
  ];
}
