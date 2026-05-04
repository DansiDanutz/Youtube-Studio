import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StrictVideoPipelineManifest } from "./schemas.js";
import { assertNoSecrets, sanitizeForManifest } from "./no-secret.js";

export type ProfessionalReadinessCheckpointKey =
  | "premium_voice_probe"
  | "design_style_bible"
  | "storyboard_shot_list"
  | "visual_asset_manifest"
  | "comfyui_visual_smoke"
  | "scene_clip_manifest"
  | "remotion_motion_smoke"
  | "motion_timeline"
  | "technical_qa"
  | "creative_qa"
  | "actual_cost_ledger"
  | "paperclip_proof"
  | "provider_approval";

export type ProfessionalQueueDecision = "queueable" | "blocked";

export interface ProfessionalReadinessCheckpoint {
  key: ProfessionalReadinessCheckpointKey;
  label: string;
  requiredArtifact: string;
  required: boolean;
  gate: string;
}

export interface ProfessionalReadinessPlan {
  runId: string;
  createdAt: string;
  queueRule: string;
  checkpoints: ProfessionalReadinessCheckpoint[];
  paidFallbackPolicy: {
    requested: boolean;
    approvalArtifact: string;
    policy: string;
  };
}

export interface ProfessionalReadinessEvaluation {
  runId: string;
  evaluatedAt: string;
  queueDecision: ProfessionalQueueDecision;
  blockers: string[];
  checkedProofCount: number;
  presentProofArtifacts: string[];
  missingProofArtifacts: string[];
}

export interface SystemLeverageLane {
  id: string;
  owner: string;
  objective: string;
  acceptanceCriteria: string[];
  proofArtifacts: string[];
}

export interface SystemLeveragePlan {
  runId: string;
  createdAt: string;
  operatingModel: string;
  executionWaves: string[];
  lanes: SystemLeverageLane[];
  openSourceEnhancements: SystemOpenSourceEnhancement[];
}

export interface SystemOpenSourceEnhancement {
  id: string;
  name: string;
  source: string;
  priority: "P0" | "P1" | "P2";
  integrationLane: string;
  whyItMatters: string;
  nextProof: string;
}

export interface ProfessionalReadinessArtifactResult {
  runId: string;
  paths: {
    readinessPlan: string;
    readinessEvaluation: string;
    systemLeveragePlan: string;
  };
}

export interface MemoFleetHealthDigestInput {
  generatedAtUtc: string;
  nervixStatus: string;
  paperclip: {
    agents: {
      total: number;
      healthy: number;
      degraded: number;
    };
    tasks: {
      open: number;
      inProgress: number;
      blocked: number;
      doneToday: number;
    };
  };
}

const REQUIRED_LOCAL_FIRST_CHECKPOINTS: ProfessionalReadinessCheckpoint[] = [
  {
    key: "premium_voice_probe",
    label: "Premium Brian-like voice probe",
    requiredArtifact: "audio/voice-proof.json",
    required: true,
    gate: "Voice route has an approved human-sounding probe, ffprobe/loudness evidence, cost entry, and no secret leakage."
  },
  {
    key: "design_style_bible",
    label: "Huashu/open-design style bible",
    requiredArtifact: "style/style-bible.json",
    required: true,
    gate: "Typography, color, subtitle, motion grammar, negative prompts, and visual identity are materialized for this run."
  },
  {
    key: "storyboard_shot_list",
    label: "Storyboard and shot list",
    requiredArtifact: "storyboard/shot-list.json",
    required: true,
    gate: "Every section has shot intent, visual source route, timing, and acceptance notes."
  },
  {
    key: "visual_asset_manifest",
    label: "Generated visual asset manifest",
    requiredArtifact: "assets/asset-manifest.json",
    required: true,
    gate: "Visual assets exist with provenance, dimensions, route, cost, and style match evidence."
  },
  {
    key: "comfyui_visual_smoke",
    label: "ComfyUI/local visual adapter smoke proof",
    requiredArtifact: "runtime/comfyui-smoke.json",
    required: true,
    gate: "ComfyUI or the configured local visual adapter has been probed for this run; service-down states are recorded as blockers, not silently bypassed."
  },
  {
    key: "scene_clip_manifest",
    label: "Scene clip manifest",
    requiredArtifact: "clips/clip-manifest.json",
    required: true,
    gate: "Animated/cinematic clips exist or are explicitly mapped to local render sources."
  },
  {
    key: "remotion_motion_smoke",
    label: "Remotion/FFmpeg motion adapter smoke proof",
    requiredArtifact: "runtime/remotion-smoke.json",
    required: true,
    gate: "Remotion or FFmpeg motion composition has produced a smoke proof with timing, overlays, and local command evidence."
  },
  {
    key: "motion_timeline",
    label: "Motion/editing timeline",
    requiredArtifact: "edit/timeline.json",
    required: true,
    gate: "Remotion/FFmpeg or equivalent timeline exists with overlays, cuts, transitions, and audio sync plan."
  },
  {
    key: "technical_qa",
    label: "Technical QA report",
    requiredArtifact: "qa/technical-report.json",
    required: true,
    gate: "ffprobe/video/audio/subtitle checks pass for the professional render or smoke clip."
  },
  {
    key: "creative_qa",
    label: "Creative QA report",
    requiredArtifact: "qa/creative-review.json",
    required: true,
    gate: "Creative review confirms non-placeholder visuals, strong pacing, coherent style, and professional polish."
  },
  {
    key: "actual_cost_ledger",
    label: "Actual cost ledger",
    requiredArtifact: "routing/actual-cost-ledger.json",
    required: true,
    gate: "Every route records actual cost, paid fallback state, and approval decision."
  },
  {
    key: "paperclip_proof",
    label: "Paperclip proof packet",
    requiredArtifact: "release/paperclip-proof.json",
    required: true,
    gate: "Paperclip-ready proof includes commands, artifact paths, QA result, cost, blocker status, and no-secret result."
  }
];

export function createProfessionalReadinessPlan(manifest: StrictVideoPipelineManifest, now = new Date()): ProfessionalReadinessPlan {
  assertNoSecrets(manifest);
  const paidFallbackRequested = manifest.input.costMode === "allow_fal_fallback" && manifest.input.allowFalFallback;
  const checkpoints = paidFallbackRequested
    ? [
        ...REQUIRED_LOCAL_FIRST_CHECKPOINTS,
        {
          key: "provider_approval" as const,
          label: "Explicit paid provider approval",
          requiredArtifact: "routing/provider-approval.json",
          required: true,
          gate: "Paid fallback must be explicitly approved for this run and linked to the actual cost ledger before any provider call."
        }
      ]
    : REQUIRED_LOCAL_FIRST_CHECKPOINTS;

  const plan: ProfessionalReadinessPlan = {
    runId: manifest.runId,
    createdAt: now.toISOString(),
    queueRule: "Queue professional final generation only when every required checkpoint artifact exists and paid fallback approval is present when requested.",
    checkpoints,
    paidFallbackPolicy: {
      requested: paidFallbackRequested,
      approvalArtifact: "routing/provider-approval.json",
      policy: paidFallbackRequested
        ? "Blocked until explicit operator approval proof exists; provider credentials must never be written to artifacts."
        : "Disabled by default; local-first routes only."
    }
  };
  return sanitizeForManifest(plan);
}

export function evaluateProfessionalReadiness(
  rootDir: string,
  manifest: StrictVideoPipelineManifest,
  plan = createProfessionalReadinessPlan(manifest),
  now = new Date()
): ProfessionalReadinessEvaluation {
  assertNoSecrets(manifest);
  assertNoSecrets(plan);
  const outputRoot = join(rootDir, manifest.outputDir);
  const required = plan.checkpoints.filter((checkpoint) => checkpoint.required);
  const presentProofArtifacts: string[] = [];
  const missingProofArtifacts: string[] = [];
  const blockers: string[] = [];

  for (const checkpoint of required) {
    const absolute = join(outputRoot, checkpoint.requiredArtifact);
    if (existsSync(absolute)) {
      const proofBlocker = validateProofArtifact(absolute, checkpoint);
      presentProofArtifacts.push(checkpoint.requiredArtifact);
      if (proofBlocker) {
        blockers.push(proofBlocker);
      }
    } else {
      missingProofArtifacts.push(checkpoint.requiredArtifact);
      if (checkpoint.key === "provider_approval") {
        blockers.push(`Paid fallback requested but professional provider approval proof is missing: ${checkpoint.requiredArtifact}`);
      } else {
        blockers.push(`Missing required proof artifact: ${checkpoint.requiredArtifact}`);
      }
    }
  }

  const evaluation: ProfessionalReadinessEvaluation = {
    runId: manifest.runId,
    evaluatedAt: now.toISOString(),
    queueDecision: blockers.length === 0 ? "queueable" : "blocked",
    blockers,
    checkedProofCount: required.length,
    presentProofArtifacts,
    missingProofArtifacts
  };
  return sanitizeForManifest(evaluation);
}

function validateProofArtifact(path: string, checkpoint: ProfessionalReadinessCheckpoint): string | undefined {
  if (!path.endsWith(".json")) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    assertNoSecrets(parsed);
    if (parsed.ok === false) {
      return `Proof artifact failed its own gate: ${checkpoint.requiredArtifact}`;
    }
    if (parsed.status === "blocked" || parsed.status === "failed" || parsed.queueDecision === "blocked") {
      return `Proof artifact reports blocked status: ${checkpoint.requiredArtifact}`;
    }
    if ((checkpoint.key === "comfyui_visual_smoke" || checkpoint.key === "remotion_motion_smoke") && parsed.adapterAvailable !== true && parsed.ok !== true) {
      return `Adapter smoke proof is not verified: ${checkpoint.requiredArtifact}`;
    }
    return undefined;
  } catch {
    return `Proof artifact is not valid sanitized JSON: ${checkpoint.requiredArtifact}`;
  }
}

export function createSystemLeveragePlan(runId: string, now = new Date()): SystemLeveragePlan {
  const plan: SystemLeveragePlan = {
    runId,
    createdAt: now.toISOString(),
    operatingModel:
      "Hermes plans and gates; David/OpenClaw executes local wiring; Paperclip owns truth; Memo reports scalar readiness; QA blocks weak output; learnings become SOPs/skills.",
    executionWaves: [
      "Wave 0: safety/control artifacts and no-secret gates.",
      "Wave 1: local-first ComfyUI/Remotion/FFmpeg/voice smoke proofs.",
      "Wave 2: optional approved premium providers with cost ledger.",
      "Wave 3: full professional render only after queueable readiness.",
      "Wave 4: Paperclip closure, Memo digest, reusable SOP/skill capture."
    ],
    openSourceEnhancements: [
      {
        id: "remotion-captions-whispercpp",
        name: "Remotion captions + whisper.cpp caption workflow",
        source: "https://github.com/remotion-dev/remotion + https://github.com/remotion-dev/template-tiktok + https://github.com/ggerganov/whisper.cpp",
        priority: "P0",
        integrationLane: "captions-motion",
        whyItMatters: "Gives the studio typed caption data, local token-level subtitle generation, and animated caption rendering without a paid transcription dependency.",
        nextProof: "Add a local caption smoke that generates SRT/JSON from the voice proof and renders burned-in captions on a short FFmpeg/Remotion clip."
      },
      {
        id: "kokoro-local-tts",
        name: "Kokoro open-weight local TTS",
        source: "https://github.com/hexgrad/kokoro + https://github.com/nazdridoy/kokoro-tts",
        priority: "P0",
        integrationLane: "voice",
        whyItMatters: "Replaces weak macOS say fallback with a stronger local narrator route while preserving $0 cost and offline-safe execution.",
        nextProof: "Install in an isolated venv, generate a 20-30 second narrator sample, ffprobe it, and compare against the current Reed proof before promoting it."
      },
      {
        id: "whisperx-or-stable-ts-alignment",
        name: "WhisperX or stable-ts forced alignment",
        source: "https://github.com/m-bain/whisperX + https://github.com/jianfch/stable-ts",
        priority: "P1",
        integrationLane: "audio-subtitle-qa",
        whyItMatters: "Improves word-level timing, subtitle readability, and audio/subtitle QA for long professional videos.",
        nextProof: "Run CPU-safe alignment on a short voice sample and write qa/subtitle-alignment-proof.json with drift metrics."
      },
      {
        id: "comfyui-video-workflow-registry",
        name: "Curated ComfyUI video workflow registry",
        source: "https://github.com/comfyanonymous/ComfyUI_examples + https://github.com/neverbiasu/Awesome-ComfyUI-Video + https://github.com/Tech-Multiverse/4k-ai-video-workflows",
        priority: "P1",
        integrationLane: "visual-assets",
        whyItMatters: "Turns ComfyUI from a one-off smoke test into a reusable visual production lane for image-to-video, upscaling, and frame interpolation.",
        nextProof: "Curate allowed workflow manifests, pin required nodes/models, and run one low-cost local workflow smoke into runtime/comfyui-video-workflow-proof.json."
      }
    ],
    lanes: [
      {
        id: "paperclip-source-of-truth",
        owner: "Hermes + Paperclip",
        objective: "Keep master/child issues, acceptance criteria, blockers, and proof comments authoritative.",
        acceptanceCriteria: ["Master issue lists all lanes", "Every blocker has owner and proof artifact", "Completion requires QA/cost/no-secret evidence"],
        proofArtifacts: ["release/paperclip-proof.json", "Paperclip issue comments"]
      },
      {
        id: "david-openclaw-executor",
        owner: "David / local OpenClaw / OpenClaude fallback",
        objective: "Execute safe local adapter wiring and smoke commands on the Mac Studio runtime.",
        acceptanceCriteria: ["Commands run locally", "No paid calls without approval", "Logs are sanitized", "Artifacts stay inside run directory"],
        proofArtifacts: ["runtime/executor-proof.json", "runtime/adapter-smoke-report.json"]
      },
      {
        id: "memo-reporting-digest",
        owner: "Memo / n8n reporting lane",
        objective: "Report scalar readiness, blockers, queue decision, cost, and proof paths without object-string formatting bugs.",
        acceptanceCriteria: ["No [object Object] output", "Counts and blockers render as readable text", "Latest run id and queue decision included"],
        proofArtifacts: ["reports/memo-digest-preview.txt", "reports/memo-digest-smoke.json"]
      },
      {
        id: "creative-production-chain",
        owner: "Hermes creative pipeline + local adapters",
        objective: "Materialize script, voice, style bible, storyboard, visual assets, scene clips, and motion timeline.",
        acceptanceCriteria: ["All required readiness artifacts exist", "Creative QA rejects placeholder output", "Actual cost ledger is complete"],
        proofArtifacts: ["audio/voice-proof.json", "style/style-bible.json", "storyboard/shot-list.json", "clips/clip-manifest.json", "edit/timeline.json"]
      },
      {
        id: "qa-release-gate",
        owner: "Hermes verifier",
        objective: "Block final release until technical, creative, cost, and no-secret checks all pass.",
        acceptanceCriteria: ["ffprobe checks pass", "Audio/subtitle sync accepted", "Creative review accepted", "No-secret scan passes"],
        proofArtifacts: ["qa/technical-report.json", "qa/creative-review.json", "release/readiness.json"]
      },
      {
        id: "learning-sop-capture",
        owner: "Hermes skills / Obsidian / Paperclip patterns",
        objective: "Convert repeatable integration workflow into reusable SOP/skill after successful live wiring.",
        acceptanceCriteria: ["Skill/reference updated after hard problem", "Pitfalls captured", "Verification commands recorded"],
        proofArtifacts: ["release/sop-capture.json", "skill/reference path"]
      }
    ]
  };
  assertNoSecrets(plan);
  return sanitizeForManifest(plan);
}

export function writeProfessionalReadinessArtifacts(
  rootDir: string,
  manifest: StrictVideoPipelineManifest,
  readinessPlan: ProfessionalReadinessPlan,
  evaluation: ProfessionalReadinessEvaluation,
  leveragePlan: SystemLeveragePlan
): ProfessionalReadinessArtifactResult {
  assertNoSecrets(manifest);
  assertNoSecrets(readinessPlan);
  assertNoSecrets(evaluation);
  assertNoSecrets(leveragePlan);
  const outputRoot = join(rootDir, manifest.outputDir);
  const paths = {
    readinessPlan: join(outputRoot, "professional", "professional-readiness-plan.json"),
    readinessEvaluation: join(outputRoot, "professional", "professional-readiness-evaluation.json"),
    systemLeveragePlan: join(outputRoot, "professional", "system-leverage-plan.json")
  };
  writeJson(paths.readinessPlan, readinessPlan);
  writeJson(paths.readinessEvaluation, evaluation);
  writeJson(paths.systemLeveragePlan, leveragePlan);
  return { runId: manifest.runId, paths };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sanitizeForManifest(value), null, 2)}\n`, "utf8");
}

export function formatMemoFleetHealthDigest(input: MemoFleetHealthDigestInput): string {
  assertNoSecrets(input);
  const agents = input.paperclip.agents;
  const tasks = input.paperclip.tasks;
  return [
    "-- Fleet Health Digest --",
    input.generatedAtUtc,
    "",
    `NERVIX: ${input.nervixStatus}`,
    `Paperclip: Agents=${agents.total} total, ${agents.healthy} healthy, ${agents.degraded} degraded | Tasks=${tasks.open} open, ${tasks.inProgress} in progress, ${tasks.blocked} blocked, ${tasks.doneToday} done today`
  ].join("\n");
}
