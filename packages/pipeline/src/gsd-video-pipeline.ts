import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type VideoPipelineStepStatus = "pending" | "running" | "locked" | "looping" | "failed";
export type VideoPipelineCostMode = "local_first" | "local_only" | "allow_fal_fallback";

export interface VideoPipelineInput {
  prompt: string;
  videoLengthSeconds: number;
  subtitlesEnabled: boolean;
  language: string;
  voicePreset: string;
  costMode: VideoPipelineCostMode;
  allowFalFallback: boolean;
  designSystem?: string;
}

export interface VideoPipelineGap {
  step: number;
  code: string;
  message: string;
  improvement: string;
}

export interface VideoPipelineStep {
  id: number;
  key: string;
  title: string;
  status: VideoPipelineStepStatus;
  scoreContribution: 0 | 1;
  predictiveScore?: number;
  requiredGate: string;
  tools: string[];
  artifacts: string[];
  gaps: VideoPipelineGap[];
  learningHook: string;
  autoresearchHook: string;
  skillUpdate: string;
}

export interface VideoScenePlan {
  id: string;
  startSecond: number;
  durationSeconds: number;
  narration: string;
  visualPrompt: string;
  subtitle: string;
  generationRoute: string;
  approvalGate: string;
}

export interface VideoPipelineManifest {
  runId: string;
  subjectSlug: string;
  createdAt: string;
  outputDir: string;
  input: VideoPipelineInput;
  totalScore: number;
  qualified: boolean;
  steps: VideoPipelineStep[];
  scenes: VideoScenePlan[];
  finalVideoPath: string;
  dailyResearchMarker: string;
  noSecretPolicy: string;
}

const STEP_DEFINITIONS: Array<Omit<VideoPipelineStep, "status" | "scoreContribution" | "gaps" | "predictiveScore">> = [
  {
    id: 1,
    key: "prompt_intake_research_score",
    title: "Prompt intake, skill DB lookup, GSD analysis, Perplexity research, Hermes/OpenClaw 8+ score gate",
    requiredGate: "Predictive score must be >= 8/10 before moving to narrative planning.",
    tools: ["Skills DB", "GSD Framework", "Perplexity MCP", "Hermes", "OpenClaw", "local plugins/MCP"],
    artifacts: ["step1_prompt_intake.json", "step1_gaps.json", "step1_skill_pattern.md"],
    learningHook: "Learning agent records prompt-pattern and gap-remediation notes when new.",
    autoresearchHook: "AutoResearch updates the general Step 1 skill/pattern for similar future prompts.",
    skillUpdate: "skill-step1 is created or refreshed after the gate locks."
  },
  {
    id: 2,
    key: "narrative_planning",
    title: "Narrative and planning for intro, context, conclusion, and image prompts",
    requiredGate: "Story covers the prompt, length, audience, facts, and conclusion with no content gaps.",
    tools: ["GSD Framework", "Hermes", "OpenClaw", "local planning tools"],
    artifacts: ["step2_narrative.json", "step2_storyboard.md"],
    learningHook: "Learning agent records story structures that worked for this prompt type.",
    autoresearchHook: "AutoResearch refreshes narrative examples and pacing patterns.",
    skillUpdate: "skill-step2 is created or refreshed."
  },
  {
    id: 3,
    key: "image_generation",
    title: "Design system and image generation",
    requiredGate: "All images/prompts align with the story and style system before scene planning.",
    tools: ["Huashu design", "popular-web-designs", "ComfyUI/local image models", "Image 2", "Siegfield MCP", "Hermes", "OpenClaw"],
    artifacts: ["step3_design_system.json", "images/", "step3_image_prompts.json"],
    learningHook: "Learning agent stores image-style and prompt improvements.",
    autoresearchHook: "AutoResearch checks daily for better image tools/models and updates docs safely.",
    skillUpdate: "skill-step3 is created or refreshed."
  },
  {
    id: 4,
    key: "subtitles_voice",
    title: "Subtitles, language/dictation support, and Brian-like human voice",
    requiredGate: "Subtitles sync to scenes; selected language is prepared; voice route is human, non-robotic, and Brian/Morgan-Freeman-like where allowed.",
    tools: ["language/dictation APIs when enabled", "ElevenLabs Brian preset", "local TTS fallback", "Hermes", "OpenClaw"],
    artifacts: ["step4_subtitles.srt", "step4_voice.json", "audio/narration.wav"],
    learningHook: "Learning agent records pronunciation, pacing, and subtitle-sync fixes.",
    autoresearchHook: "AutoResearch tracks voice/subtitle tools daily and updates this step when safer/better.",
    skillUpdate: "skill-step4 is created or refreshed."
  },
  {
    id: 5,
    key: "scene_planning",
    title: "Scene planning with Seedance 2.0, Remotion, local models, OpenClaude adapters, optional fal.ai prompts",
    requiredGate: "Every scene prompt is GSD-verified and Hermes-approved; low-cost local route is preferred before fal.ai fallback.",
    tools: ["Seedance 2.0", "Remotion", "OpenClaude CLI", "OpenClaw adapters", "local video models", "fal.ai fallback prompts"],
    artifacts: ["step5_scene_plan.json", "remotion/", "fal_prompts.json"],
    learningHook: "Learning agent records scene prompt formulas and regeneration causes.",
    autoresearchHook: "AutoResearch refreshes scene/video model options once per day.",
    skillUpdate: "skill-step5 is created or refreshed."
  },
  {
    id: 6,
    key: "video_generation",
    title: "Scene video generation and regeneration controls",
    requiredGate: "All scenes generated or explicitly marked for regeneration with verified prompts and artifacts.",
    tools: ["ComfyUI/Wan/Hunyuan/AnimateDiff", "OpenClaw video providers", "Remotion previews", "local model adapters"],
    artifacts: ["step6_generation_manifest.json", "scenes/*.mp4", "regeneration_requests.json"],
    learningHook: "Learning agent records generation settings and failed-scene remediation.",
    autoresearchHook: "AutoResearch updates generation docs and model/tool choices when improved.",
    skillUpdate: "skill-step6 is created or refreshed."
  },
  {
    id: 7,
    key: "video_editing",
    title: "Editing video, sound, subtitles, and daily evolution check",
    requiredGate: "Edit is coherent, sound/subtitle sync passes, and daily tool-skill-plugin research has been checked or reused.",
    tools: ["FFmpeg", "Remotion", "subtitle muxing", "daily tool research", "Hermes approval"],
    artifacts: ["step7_edit_decisions.json", "edited_timeline.json"],
    learningHook: "Learning agent stores repeatable edit patterns and sync fixes.",
    autoresearchHook: "Mandatory daily AutoResearch update for editing tools and plugins.",
    skillUpdate: "skill-step7 is created or refreshed."
  },
  {
    id: 8,
    key: "rendering",
    title: "Best-quality rendering",
    requiredGate: "Final render settings match platform, quality, audio, and subtitle requirements.",
    tools: ["FFmpeg", "Remotion renderer", "quality presets"],
    artifacts: ["step8_render_manifest.json", "render/final.mp4"],
    learningHook: "Learning agent records render settings that passed review.",
    autoresearchHook: "AutoResearch tracks better render/encoding settings.",
    skillUpdate: "skill-step8 is created or refreshed."
  },
  {
    id: 9,
    key: "final_verdict",
    title: "Final video verdict by GLM/Kimi/GPT plus Hermes verification",
    requiredGate: "Final verdict passes; otherwise loop back to the failed step with documented gaps.",
    tools: ["GLM", "Kimi", "GPT", "Hermes visual/audio review"],
    artifacts: ["step9_final_verdict.json"],
    learningHook: "Learning agent records final-review defects and fixes.",
    autoresearchHook: "AutoResearch updates verdict rubric when failures recur.",
    skillUpdate: "skill-step9 is created or refreshed."
  },
  {
    id: 10,
    key: "addons",
    title: "Add-ons, animations, and quality upgrades",
    requiredGate: "Only add improvements that raise quality without destabilizing the locked pipeline.",
    tools: ["animation plugins", "Remotion effects", "local design skills", "Hermes approval"],
    artifacts: ["step10_addons.json", "final_video_manifest.json"],
    learningHook: "Learning agent records optional add-ons that actually improve outcomes.",
    autoresearchHook: "AutoResearch adds safe future add-ons to documentation.",
    skillUpdate: "skill-step10 is created or refreshed."
  }
];

export function createVideoPipelineManifest(input: VideoPipelineInput, now = new Date()): VideoPipelineManifest {
  const normalized = normalizeVideoPipelineInput(input);
  const subjectSlug = slugify(normalized.prompt);
  const stamp = formatStamp(now);
  const runId = `${subjectSlug}-${stamp}`;
  const outputDir = join("videos", runId);
  const gaps = scorePromptReadiness(normalized);
  const predictiveScore = Math.max(1, 10 - gaps.length);
  const qualified = predictiveScore >= 8;
  const steps = STEP_DEFINITIONS.map((definition) => {
    const stepGaps = definition.id === 1 ? gaps : [];
    const locked = qualified || definition.id === 1;
    const step: VideoPipelineStep = {
      ...definition,
      status: locked ? "locked" : "pending",
      scoreContribution: locked && (definition.id === 1 ? qualified : true) ? 1 : 0,
      gaps: stepGaps
    };
    if (definition.id === 1) {
      step.predictiveScore = predictiveScore;
      step.status = qualified ? "locked" : "looping";
      step.scoreContribution = qualified ? 1 : 0;
    }
    return step;
  });

  const scenes = buildScenePlan(normalized);
  const totalScore = steps.reduce((sum, step) => sum + step.scoreContribution, 0);
  return {
    runId,
    subjectSlug,
    createdAt: now.toISOString(),
    outputDir,
    input: normalized,
    totalScore,
    qualified,
    steps,
    scenes,
    finalVideoPath: join(outputDir, "render", "final.mp4"),
    dailyResearchMarker: join(outputDir, "daily-autoresearch-marker.json"),
    noSecretPolicy: "Artifacts must contain only env-var names and sanitized provider routes; raw keys/tokens/secrets are forbidden."
  };
}

export function writeVideoPipelineArtifacts(rootDir: string, manifest: VideoPipelineManifest): Record<string, string> {
  const outputRoot = join(rootDir, manifest.outputDir);
  mkdirSync(outputRoot, { recursive: true });
  mkdirSync(join(outputRoot, "images"), { recursive: true });
  mkdirSync(join(outputRoot, "audio"), { recursive: true });
  mkdirSync(join(outputRoot, "scenes"), { recursive: true });
  mkdirSync(join(outputRoot, "render"), { recursive: true });

  const paths: Record<string, string> = {
    manifest: join(outputRoot, "pipeline-manifest.json"),
    step1: join(outputRoot, "step1_prompt_intake.json"),
    step2: join(outputRoot, "step2_narrative.json"),
    step3: join(outputRoot, "step3_design_system.json"),
    step4: join(outputRoot, "step4_subtitles_voice.json"),
    step5: join(outputRoot, "step5_scene_plan.json"),
    step6: join(outputRoot, "step6_generation_manifest.json"),
    step7: join(outputRoot, "step7_edit_decisions.json"),
    step8: join(outputRoot, "step8_render_manifest.json"),
    step9: join(outputRoot, "step9_final_verdict.json"),
    step10: join(outputRoot, "step10_addons.json"),
    srt: join(outputRoot, "step4_subtitles.srt"),
    skillIndex: join(outputRoot, "skill-step-index.md"),
    dashboardJob: join(outputRoot, "dashboard-job.json")
  };

  writeJson(paths.manifest, manifest);
  writeJson(paths.step1, {
    prompt: manifest.input.prompt,
    predictiveScore: manifest.steps[0]?.predictiveScore,
    qualified: manifest.qualified,
    gaps: manifest.steps[0]?.gaps ?? [],
    nextInputIfLooping: manifest.qualified ? null : buildLoopInput(manifest)
  });
  writeJson(paths.step2, buildNarrative(manifest));
  writeJson(paths.step3, buildDesignSystem(manifest));
  writeJson(paths.step4, buildVoiceAndSubtitlePlan(manifest));
  writeJson(paths.step5, { scenes: manifest.scenes, gate: manifest.steps[4]?.requiredGate });
  writeJson(paths.step6, buildGenerationPlan(manifest));
  writeJson(paths.step7, buildEditPlan(manifest));
  writeJson(paths.step8, buildRenderPlan(manifest));
  writeJson(paths.step9, buildVerdictPlan(manifest));
  writeJson(paths.step10, buildAddonPlan(manifest));
  writeText(paths.srt, renderSrt(manifest.scenes));
  writeText(paths.skillIndex, renderSkillIndex(manifest));
  writeJson(paths.dashboardJob, {
    runId: manifest.runId,
    status: manifest.qualified ? "ready_for_execution" : "needs_step1_loop",
    outputDir: manifest.outputDir,
    finalVideoPath: manifest.finalVideoPath,
    score: manifest.totalScore,
    controls: {
      regenerateSceneEndpoint: "/api/video-pipeline/regenerate-scene",
      approveStepEndpoint: "/api/video-pipeline/approve-step",
      localOrchestratorEndpoint: "ORCHESTRATOR_API_URL"
    }
  });
  return paths;
}

function normalizeVideoPipelineInput(input: VideoPipelineInput): VideoPipelineInput {
  return {
    prompt: input.prompt.trim(),
    videoLengthSeconds: Math.max(15, Math.round(input.videoLengthSeconds || 60)),
    subtitlesEnabled: Boolean(input.subtitlesEnabled),
    language: (input.language || "en").trim(),
    voicePreset: (input.voicePreset || "elevenlabs_brian_like_human").trim(),
    costMode: input.costMode || "local_first",
    allowFalFallback: Boolean(input.allowFalFallback),
    designSystem: (input.designSystem || "elevenlabs cinematic dark + Vercel precision").trim()
  };
}

function scorePromptReadiness(input: VideoPipelineInput): VideoPipelineGap[] {
  const gaps: VideoPipelineGap[] = [];
  if (input.prompt.length < 12) {
    gaps.push({ step: 1, code: "PROMPT_TOO_SHORT", message: "Prompt is too short for reliable research/story planning.", improvement: "Ask GSD to expand intent, target audience, and expected output." });
  }
  if (input.prompt.split(/\s+/).filter(Boolean).length < 4) {
    gaps.push({ step: 1, code: "PROMPT_UNDERSPECIFIED", message: "Prompt lacks enough terms to predict the full 10-step workflow safely.", improvement: "Expand the prompt with subject, audience, desired answer type, and video angle." });
  }
  if (!input.language) {
    gaps.push({ step: 1, code: "LANGUAGE_MISSING", message: "Subtitle/dictation language is missing.", improvement: "Default to English or request the user-selected language." });
  }
  if (input.videoLengthSeconds < 15) {
    gaps.push({ step: 1, code: "LENGTH_TOO_SHORT", message: "Video length cannot support the 10-step story pipeline.", improvement: "Use at least 15 seconds." });
  }
  if (input.costMode === "local_only" && input.allowFalFallback) {
    gaps.push({ step: 1, code: "COST_MODE_CONFLICT", message: "Local-only mode conflicts with fal.ai fallback.", improvement: "Disable fal.ai or switch to local-first mode." });
  }
  return gaps;
}

function buildScenePlan(input: VideoPipelineInput): VideoScenePlan[] {
  const sceneCount = Math.max(3, Math.min(10, Math.ceil(input.videoLengthSeconds / 12)));
  const duration = Math.max(4, Math.floor(input.videoLengthSeconds / sceneCount));
  return Array.from({ length: sceneCount }, (_, index) => {
    const startSecond = index * duration;
    const isFirst = index === 0;
    const isLast = index === sceneCount - 1;
    const beat = isFirst ? "hook" : isLast ? "conclusion" : `evidence beat ${index}`;
    return {
      id: `scene-${index + 1}`,
      startSecond,
      durationSeconds: isLast ? input.videoLengthSeconds - startSecond : duration,
      narration: `${beat}: explain ${input.prompt} with grounded, human narration.`,
      visualPrompt: `${input.designSystem}. ${beat} for video about: ${input.prompt}. 9:16, cinematic, readable, no logos unless sourced.`,
      subtitle: `${beat}: ${input.prompt}`,
      generationRoute: input.costMode === "local_only" ? "local_remotion_comfy_openclaw" : "local_first_then_optional_fal_prompt_only",
      approvalGate: "GSD scene prompt approved by Hermes before generation."
    };
  });
}

function buildNarrative(manifest: VideoPipelineManifest) {
  return {
    intro: `Open with a strong question around: ${manifest.input.prompt}`,
    context: "Explain why the topic matters this week, using Perplexity-researched candidates and skill database patterns.",
    body: manifest.scenes.map((scene) => scene.narration),
    conclusion: "Close with the clear best answer, uncertainty notes, and why the selected framework/tool wins.",
    lengthSeconds: manifest.input.videoLengthSeconds,
    gate: manifest.steps[1]?.requiredGate
  };
}

function buildDesignSystem(manifest: VideoPipelineManifest) {
  return {
    style: manifest.input.designSystem,
    preferredSkills: ["Huashu design", "popular-web-designs/elevenlabs", "popular-web-designs/vercel", "comfyui"],
    imagePromptCount: manifest.scenes.length,
    imagePrompts: manifest.scenes.map((scene) => ({ id: scene.id, prompt: scene.visualPrompt })),
    gate: manifest.steps[2]?.requiredGate
  };
}

function buildVoiceAndSubtitlePlan(manifest: VideoPipelineManifest) {
  return {
    language: manifest.input.language,
    subtitlesEnabled: manifest.input.subtitlesEnabled,
    subtitleFile: "step4_subtitles.srt",
    voicePreset: manifest.input.voicePreset,
    voicePolicy: "Use ElevenLabs Brian when configured; otherwise use local TTS fallback. Voice must be human, calm, cinematic, non-robotic, and not an impersonation claim.",
    narrationText: manifest.scenes.map((scene) => scene.narration).join("\n"),
    gate: manifest.steps[3]?.requiredGate
  };
}

function buildGenerationPlan(manifest: VideoPipelineManifest) {
  return {
    preferredOrder: ["Remotion composition", "ComfyUI local video workflow", "OpenClaw local video provider", "fal.ai prompt fallback only if enabled"],
    falAllowed: manifest.input.allowFalFallback && manifest.input.costMode === "allow_fal_fallback",
    scenes: manifest.scenes.map((scene) => ({ id: scene.id, route: scene.generationRoute, output: `scenes/${scene.id}.mp4`, regenerate: false })),
    gate: manifest.steps[5]?.requiredGate
  };
}

function buildEditPlan(manifest: VideoPipelineManifest) {
  return {
    timeline: manifest.scenes.map((scene) => ({ sceneId: scene.id, start: scene.startSecond, duration: scene.durationSeconds })),
    audio: "audio/narration.wav",
    subtitles: manifest.input.subtitlesEnabled ? "step4_subtitles.srt" : null,
    dailyEvolutionCheck: manifest.dailyResearchMarker,
    gate: manifest.steps[6]?.requiredGate
  };
}

function buildRenderPlan(manifest: VideoPipelineManifest) {
  return {
    format: "mp4",
    aspectRatio: "9:16",
    resolution: "1080x1920",
    fps: 30,
    audioLufsTarget: -14,
    output: manifest.finalVideoPath,
    gate: manifest.steps[7]?.requiredGate
  };
}

function buildVerdictPlan(manifest: VideoPipelineManifest) {
  return {
    reviewers: ["GLM", "Kimi", "GPT", "Hermes"],
    passCriteria: ["facts grounded", "story complete", "scene sync", "voice human", "subtitles clean", "render playable", "no secrets"],
    ifRejected: "Loop back to the lowest failing step, document gaps, regenerate only needed artifacts, and re-score.",
    gate: manifest.steps[8]?.requiredGate
  };
}

function buildAddonPlan(manifest: VideoPipelineManifest) {
  return {
    candidates: ["subtle kinetic typography", "data-callout cards", "sound-design risers", "animated source badges"],
    rule: "Apply only if Hermes predicts quality gain without cost/stability risk.",
    finalScoreTarget: 10,
    gate: manifest.steps[9]?.requiredGate
  };
}

function buildLoopInput(manifest: VideoPipelineManifest) {
  return {
    prompt: manifest.input.prompt,
    gaps: manifest.steps[0]?.gaps.map((gap) => gap.improvement) ?? [],
    rerun: ["GSD analysis", "Perplexity MCP search", "Hermes/OpenClaw tool selection", "score gate"]
  };
}

function renderSrt(scenes: VideoScenePlan[]): string {
  return scenes
    .map((scene, index) => `${index + 1}\n${formatSrtTime(scene.startSecond)} --> ${formatSrtTime(scene.startSecond + scene.durationSeconds)}\n${scene.subtitle}\n`)
    .join("\n");
}

function renderSkillIndex(manifest: VideoPipelineManifest): string {
  const lines = [
    `# Skill-step index for ${manifest.runId}`,
    "",
    "Each locked step must create/update the corresponding reusable skill entry, then Learning and AutoResearch hooks update future workflows.",
    ""
  ];
  for (const step of manifest.steps) {
    lines.push(`## skill-step${step.id}: ${step.title}`);
    lines.push(`- Status: ${step.status}`);
    lines.push(`- Gate: ${step.requiredGate}`);
    lines.push(`- Skill update: ${step.skillUpdate}`);
    lines.push(`- Learning: ${step.learningHook}`);
    lines.push(`- AutoResearch: ${step.autoresearchHook}`);
    lines.push("");
  }
  return lines.join("\n");
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(path: string, value: string): void {
  writeFileSync(path, `${value}\n`, "utf8");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "video-pipeline";
}

function formatStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function formatSrtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},000`;
}
