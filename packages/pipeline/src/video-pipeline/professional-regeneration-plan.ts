import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StrictVideoPipelineManifest } from "./schemas.js";
import { assertNoSecrets, sanitizeForManifest } from "./no-secret.js";

export type ProfessionalToolKey =
  | "elevenlabs_brian_voice"
  | "fal_ai"
  | "seedance_highsfield"
  | "capcut"
  | "comfyui"
  | "remotion"
  | "ffmpeg"
  | "huashu_design_system";

export type ProfessionalToolStatus = "wired" | "available_not_wired" | "configured_not_verified" | "missing" | "blocked";
export type ProfessionalRequirementStatus = "ready" | "blocked";

export interface ProfessionalToolAuditItem {
  key: ProfessionalToolKey;
  label: string;
  status: ProfessionalToolStatus;
  evidence: string;
  safeNextAction: string;
  requiredForProfessionalRelease: boolean;
}

export interface ProfessionalGapItem {
  code: string;
  severity: "blocker" | "high" | "medium";
  requirement: string;
  currentState: string;
  missingIntegration: string;
  unblockAction: string;
}

export interface ProfessionalRegenerationStep {
  id: string;
  title: string;
  ownerLane: string;
  inputs: string[];
  outputs: string[];
  gate: string;
}

export interface ProfessionalRegenerationPlan {
  runId: string;
  createdAt: string;
  releaseDecision: ProfessionalRequirementStatus;
  toolAudit: ProfessionalToolAuditItem[];
  gaps: ProfessionalGapItem[];
  steps: ProfessionalRegenerationStep[];
  paperclipProofRequired: boolean;
  finalDecision: string;
}

export interface ProfessionalRegenerationPlanResult {
  plan: ProfessionalRegenerationPlan;
  paths: {
    plan: string;
    toolAudit: string;
    gaps: string;
  };
}

export function createProfessionalRegenerationPlan(
  manifest: StrictVideoPipelineManifest,
  toolAudit: ProfessionalToolAuditItem[],
  now = new Date()
): ProfessionalRegenerationPlan {
  assertNoSecrets(manifest);
  assertNoSecrets(toolAudit);
  const gaps = buildProfessionalGaps(toolAudit);
  const releaseDecision: ProfessionalRequirementStatus = gaps.some((gap) => gap.severity === "blocker") ? "blocked" : "ready";
  const plan: ProfessionalRegenerationPlan = {
    runId: manifest.runId,
    createdAt: now.toISOString(),
    releaseDecision,
    toolAudit,
    gaps,
    steps: buildRegenerationSteps(),
    paperclipProofRequired: true,
    finalDecision:
      releaseDecision === "ready"
        ? "Professional regeneration may run after operator approval and cost ledger initialization."
        : "Do not regenerate a professional final video yet; wire the blocker integrations first, or run only a labeled local proof."
  };
  return sanitizeForManifest(plan);
}

export function writeProfessionalRegenerationPlanArtifacts(
  rootDir: string,
  manifest: StrictVideoPipelineManifest,
  plan: ProfessionalRegenerationPlan
): ProfessionalRegenerationPlanResult {
  assertNoSecrets(plan);
  const outputRoot = join(rootDir, manifest.outputDir);
  const paths = {
    plan: join(outputRoot, "professional", "professional-regeneration-plan.json"),
    toolAudit: join(outputRoot, "professional", "tool-audit.json"),
    gaps: join(outputRoot, "professional", "gap-analysis.json")
  };
  writeJson(paths.plan, plan);
  writeJson(paths.toolAudit, { runId: manifest.runId, toolAudit: plan.toolAudit });
  writeJson(paths.gaps, { runId: manifest.runId, releaseDecision: plan.releaseDecision, gaps: plan.gaps });
  return { plan, paths };
}

export function buildMacStudioToolAuditFromVerifiedEvidence(): ProfessionalToolAuditItem[] {
  return [
    {
      key: "elevenlabs_brian_voice",
      label: "ElevenLabs Brian-like narration route",
      status: "configured_not_verified",
      evidence: "ELEVENLABS_API_KEY is present and Python elevenlabs package imports; no ELEVENLABS_VOICE_ID or ELEVENLABS_BRIAN_VOICE_ID is configured, and the strict TypeScript pipeline has no live ElevenLabs connector.",
      safeNextAction: "Select/store the approved Brian voice ID, add an explicit operator/cost gate, generate a short probe clip, and log the actual cost without exposing credentials.",
      requiredForProfessionalRelease: true
    },
    {
      key: "fal_ai",
      label: "fal.ai paid fallback route",
      status: "configured_not_verified",
      evidence: "FAL_API_KEY is present and fal_client imports; fal CLI is not installed and the strict pipeline intentionally blocks paid fallback live execution.",
      safeNextAction: "Keep disabled by default; add a paid-fallback connector only behind allow_fal_fallback plus explicit approval and per-run cost ledger.",
      requiredForProfessionalRelease: false
    },
    {
      key: "seedance_highsfield",
      label: "Seedance/Highsfield-style scene generation route",
      status: "available_not_wired",
      evidence: "Seedance/Highsfield-related API env presence exists and open-design has 39 video prompt templates plus 3 MP4 examples; no strict pipeline adapter invokes this route yet.",
      safeNextAction: "Convert prompt templates into scene-route manifests and add a gated adapter that can emit clips/clip-manifest.json with provider/cost proof.",
      requiredForProfessionalRelease: true
    },
    {
      key: "capcut",
      label: "CapCut editor hook",
      status: "configured_not_verified",
      evidence: "CAPCUT_API_KEY presence exists, but no capcut CLI is on PATH and CapCut.app is not installed under /Applications.",
      safeNextAction: "Do not depend on CapCut for automation; use Remotion/FFmpeg locally, or install/verify CapCut only as an optional human-editor export lane.",
      requiredForProfessionalRelease: false
    },
    {
      key: "comfyui",
      label: "ComfyUI local visual generation",
      status: "blocked",
      evidence: "OpenClaw has a Comfy video provider artifact, but no comfy CLI is on PATH and 127.0.0.1:8188/system_stats is not serving.",
      safeNextAction: "Start or install local ComfyUI, verify /system_stats, then run a one-image smoke before allowing professional visual generation.",
      requiredForProfessionalRelease: true
    },
    {
      key: "remotion",
      label: "Remotion motion graphics/render route",
      status: "missing",
      evidence: "No remotion binary on PATH, no Remotion dependency in YouTube-Studio package.json, and only one external docs reference was found.",
      safeNextAction: "Add Remotion dependency and a minimal local composition that renders a proof clip before professional regeneration.",
      requiredForProfessionalRelease: true
    },
    {
      key: "ffmpeg",
      label: "FFmpeg/ffprobe render and QA route",
      status: "wired",
      evidence: "ffmpeg and ffprobe are installed at /opt/homebrew/bin, version 8.1; Phase 5 live proof already uses them for real MP4 and measured QA.",
      safeNextAction: "Keep as the deterministic render/QA backbone and add loudness/frame-sample checks for professional release.",
      requiredForProfessionalRelease: true
    },
    {
      key: "huashu_design_system",
      label: "Huashu/open-design design-system assets",
      status: "available_not_wired",
      evidence: "open-design assets are present: Xiaohongshu DESIGN.md, Hyperframes, motion-frames, video-shortform, 39 video prompt templates, and 3 MP4 examples; strict pipeline only references these conceptually.",
      safeNextAction: "Import selected design tokens into style-bible.json and generate storyboard/overlay assets from the chosen system.",
      requiredForProfessionalRelease: true
    }
  ];
}

function buildProfessionalGaps(toolAudit: ProfessionalToolAuditItem[]): ProfessionalGapItem[] {
  const byKey = new Map(toolAudit.map((item) => [item.key, item]));
  const gaps: ProfessionalGapItem[] = [];
  const addIfNotReady = (key: ProfessionalToolKey, gap: Omit<ProfessionalGapItem, "currentState">): void => {
    const item = byKey.get(key);
    if (!item || item.status !== "wired") {
      gaps.push({ ...gap, currentState: item ? item.evidence : "No verified evidence." });
    }
  };

  addIfNotReady("elevenlabs_brian_voice", {
    code: "VOICE_NOT_PROFESSIONAL_LIVE",
    severity: "blocker",
    requirement: "Premium Brian-like human narration with explicit approval/cost proof.",
    missingIntegration: "Strict pipeline does not generate real premium narration; existing automation script can call ElevenLabs but is not wired to the strict artifact contract.",
    unblockAction: "Wire an approved ElevenLabs narration adapter or choose a verified local premium voice fallback, then ffprobe/loudness-check the output."
  });
  addIfNotReady("comfyui", {
    code: "COMFYUI_NOT_SERVING",
    severity: "blocker",
    requirement: "Local visual asset generation must be available for professional scene sources.",
    missingIntegration: "No running ComfyUI API for asset_generation or scene_clip_generation.",
    unblockAction: "Start/install ComfyUI, verify /system_stats, and produce one smoke asset into the run artifact directory."
  });
  addIfNotReady("remotion", {
    code: "REMOTION_NOT_WIRED",
    severity: "blocker",
    requirement: "Motion graphics, overlays, lower-thirds, and timeline assembly must be rendered from a repeatable composition system.",
    missingIntegration: "No Remotion dependency/composition exists in YouTube-Studio.",
    unblockAction: "Add a Remotion composition and render smoke, then feed FFmpeg final packaging."
  });
  addIfNotReady("seedance_highsfield", {
    code: "SCENE_VIDEO_ROUTE_NOT_WIRED",
    severity: "high",
    requirement: "Professional animated/cinematic scene clips need a concrete local or approved provider route.",
    missingIntegration: "Seedance/Highsfield templates and credentials are not connected to a strict adapter or cost gate.",
    unblockAction: "Create a scene-generation adapter that emits clips plus route/cost/provenance manifests."
  });
  addIfNotReady("huashu_design_system", {
    code: "DESIGN_SYSTEM_NOT_IMPORTED",
    severity: "high",
    requirement: "A coherent style bible must drive visuals, typography, subtitles, and transitions.",
    missingIntegration: "Open-design assets exist but are not imported into generated style-bible/storyboard/render overlays.",
    unblockAction: "Select one design system and materialize its tokens in style/style-bible.json and edit/overlay artifacts."
  });

  return gaps;
}

function buildRegenerationSteps(): ProfessionalRegenerationStep[] {
  return [
    {
      id: "voice-probe",
      title: "Generate and approve a 20-30 second premium narration probe",
      ownerLane: "voice_audio_design",
      inputs: ["script/script.md", "approved voice preset", "operator/cost approval if external"],
      outputs: ["audio/narration-probe.mp3", "audio/voice-proof.json", "routing/actual-cost-ledger.json"],
      gate: "Human-sounding Brian-like narration, no robotic placeholder, cost recorded, no secrets."
    },
    {
      id: "design-style-bible",
      title: "Materialize the selected Huashu/open-design style bible",
      ownerLane: "visual_identity_style_bible",
      inputs: ["open-design design tokens", "prompt", "target platform"],
      outputs: ["style/style-bible.json", "storyboard/shot-list.json", "subtitles/overlay-style.json"],
      gate: "One coherent visual system, subtitle style, typography, motion grammar, and negative prompts."
    },
    {
      id: "visual-smoke",
      title: "Create one verified professional visual scene source",
      ownerLane: "asset_generation",
      inputs: ["style/style-bible.json", "storyboard/shot-list.json", "ComfyUI or approved provider route"],
      outputs: ["assets/smoke-scene.png", "assets/asset-manifest.json", "qa/visual-smoke-review.json"],
      gate: "Asset exists, matches style, route/provenance logged, no paid surprise."
    },
    {
      id: "motion-edit-smoke",
      title: "Render a motion graphics/editing smoke clip",
      ownerLane: "assembly_edit_rhythm",
      inputs: ["assets/smoke-scene.png", "audio/narration-probe.mp3", "subtitles/overlay-style.json"],
      outputs: ["clips/motion-smoke.mp4", "edit/timeline.json", "qa/ffprobe-smoke.json"],
      gate: "Remotion/FFmpeg clip renders with synced audio/subtitle overlays and measured ffprobe proof."
    },
    {
      id: "full-professional-render",
      title: "Render full Hermes/DansLab video only after all blocker gates pass",
      ownerLane: "render_platform_exports",
      inputs: ["approved full script", "all scene clips/assets", "final narration", "edit timeline"],
      outputs: ["render/final-professional.mp4", "qa/final-qa.json", "release/paperclip-proof.json"],
      gate: "No blocker gaps, measured technical QA, creative QA, cost ledger, and Paperclip proof complete."
    }
  ];
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sanitizeForManifest(value), null, 2)}\n`, "utf8");
}
