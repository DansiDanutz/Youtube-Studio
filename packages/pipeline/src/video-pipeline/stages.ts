import type { StageDefinition } from "./schemas.js";

export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    index: 0,
    key: "job_contract_intent",
    title: "Job contract and intent lock",
    objective: "Convert the raw prompt into a precise production contract with audience, format, length, constraints, and acceptance target.",
    gate: "Prompt contract must be specific enough to route research, script, visuals, audio, cost, and QA without guessing.",
    requiredArtifacts: ["contract/job-contract.json"],
    tools: ["Hermes", "GSD", "skills", "Paperclip"],
    weight: 5,
    rollbackOnFailure: "job_contract_intent"
  },
  {
    index: 1,
    key: "research_factual_grounding",
    title: "Research and factual grounding",
    objective: "Build source-backed claims, citation registry, uncertainty notes, and freshness context.",
    gate: "Every factual claim needing support must map to a source or explicit uncertainty note.",
    requiredArtifacts: ["research/citation-registry.json", "research/fact-pack.md"],
    tools: ["Perplexity MCP", "web search", "skills", "local memory"],
    weight: 8,
    rollbackOnFailure: "research_factual_grounding"
  },
  {
    index: 2,
    key: "creative_strategy_hook",
    title: "Creative strategy and hook",
    objective: "Choose the angle, promise, opening hook, emotional arc, and viewer retention strategy.",
    gate: "Hook must be clear, differentiated, accurate, and matched to platform/audience.",
    requiredArtifacts: ["strategy/creative-brief.json"],
    tools: ["Hermes", "OpenClaw", "strategy rubric"],
    weight: 6,
    rollbackOnFailure: "creative_strategy_hook"
  },
  {
    index: 3,
    key: "script_pacing",
    title: "Script and pacing",
    objective: "Produce narration, beat timing, transitions, CTA, and estimated duration.",
    gate: "Script duration must fit target length and every beat must serve the viewer promise.",
    requiredArtifacts: ["script/script.md", "script/beat-timeline.json"],
    tools: ["structured JSON", "LLM judge", "duration estimator"],
    weight: 7,
    rollbackOnFailure: "script_pacing"
  },
  {
    index: 4,
    key: "visual_identity_style_bible",
    title: "Visual identity and style bible",
    objective: "Lock art direction, typography, colors, negative prompts, consistency rules, and brand safety.",
    gate: "Style bible must be coherent, renderable, and safe for repeated scene generation.",
    requiredArtifacts: ["style/style-bible.json", "style/negative-prompts.txt"],
    tools: ["popular-web-designs", "comfyui", "design skills"],
    weight: 6,
    rollbackOnFailure: "visual_identity_style_bible"
  },
  {
    index: 5,
    key: "storyboard_shot_architecture",
    title: "Storyboard and shot architecture",
    objective: "Turn script beats into shot list, camera language, composition notes, and scene dependencies.",
    gate: "Every shot must map to script, duration, visual prompt, and generation route.",
    requiredArtifacts: ["storyboard/shot-list.json", "storyboard/storyboard.md"],
    tools: ["Hermes", "storyboard rubric", "shot templates"],
    weight: 7,
    rollbackOnFailure: "storyboard_shot_architecture"
  },
  {
    index: 6,
    key: "tool_routing_cost_fallback",
    title: "Tool routing, cost, and fallback plan",
    objective: "Select local-first tools, paid fallback policy, health checks, and explicit approval requirements.",
    gate: "No paid fallback or external provider may run without explicit policy and approval state.",
    requiredArtifacts: ["routing/tool-routing.json", "routing/cost-ledger.json"],
    tools: ["Hermes", "OpenClaw", "cost ledger", "adapter health checks"],
    weight: 6,
    rollbackOnFailure: "tool_routing_cost_fallback"
  },
  {
    index: 7,
    key: "asset_generation",
    title: "Asset generation",
    objective: "Generate stills, design cards, overlays, source badges, and reusable scene assets.",
    gate: "Generated assets must match style bible and have lineage metadata.",
    requiredArtifacts: ["assets/asset-manifest.json"],
    tools: ["ComfyUI", "local image models", "Remotion graphics", "optional approved fallback"],
    weight: 6,
    rollbackOnFailure: "asset_generation"
  },
  {
    index: 8,
    key: "voice_audio_design",
    title: "Voice and audio design",
    objective: "Generate or route narration, pronunciation dictionary, pacing, loudness target, and audio intent.",
    gate: "Voice must be human, clear, licensed/allowed, language-correct, and synced to script timing.",
    requiredArtifacts: ["audio/voice-plan.json", "audio/pronunciation-dictionary.json"],
    tools: ["ElevenLabs when approved", "local TTS fallback", "FFmpeg"],
    weight: 6,
    rollbackOnFailure: "voice_audio_design"
  },
  {
    index: 9,
    key: "subtitles_overlays",
    title: "Subtitles and overlays",
    objective: "Produce readable SRT/VTT/ASS subtitles and text overlay timing.",
    gate: "Subtitles must be readable, synced, language-correct, and not cover critical visuals.",
    requiredArtifacts: ["subtitles/subtitles.srt", "subtitles/overlay-plan.json"],
    tools: ["subtitle utilities", "language tools", "Remotion"],
    weight: 5,
    rollbackOnFailure: "subtitles_overlays"
  },
  {
    index: 10,
    key: "scene_clip_generation",
    title: "Scene clip generation",
    objective: "Generate video clips for each shot with regeneration controls and provenance.",
    gate: "Each clip must be present or explicitly queued for regeneration with cause and route.",
    requiredArtifacts: ["clips/clip-manifest.json"],
    tools: ["ComfyUI", "Wan/Hunyuan/AnimateDiff slots", "Remotion", "OpenClaw adapters"],
    weight: 8,
    rollbackOnFailure: "scene_clip_generation"
  },
  {
    index: 11,
    key: "assembly_edit_rhythm",
    title: "Assembly edit and rhythm",
    objective: "Build timeline, transitions, captions, visual rhythm, and retention-driven edit decisions.",
    gate: "Timeline must match script/audio/subtitles and avoid dead air, jarring cuts, or drift.",
    requiredArtifacts: ["edit/timeline.json", "edit/edit-decisions.json"],
    tools: ["Remotion", "FFmpeg", "Hermes edit review"],
    weight: 7,
    rollbackOnFailure: "assembly_edit_rhythm"
  },
  {
    index: 12,
    key: "music_sfx_mix",
    title: "Music, SFX, and mix",
    objective: "Add music/SFX, normalize loudness, and prevent narration masking.",
    gate: "Mix must meet loudness target and keep narration intelligible.",
    requiredArtifacts: ["audio/mix-plan.json"],
    tools: ["FFmpeg", "local audio tools", "licensed music/SFX library slots"],
    weight: 4,
    rollbackOnFailure: "music_sfx_mix"
  },
  {
    index: 13,
    key: "render_platform_exports",
    title: "Render and platform exports",
    objective: "Render master file and platform variants with thumbnails/metadata.",
    gate: "Render must exist, be playable, match requested format, and include platform export metadata.",
    requiredArtifacts: ["render/final.mp4", "render/export-manifest.json"],
    tools: ["Remotion", "FFmpeg", "platform presets"],
    weight: 7,
    rollbackOnFailure: "render_platform_exports"
  },
  {
    index: 14,
    key: "technical_qa",
    title: "Technical QA",
    objective: "Verify file existence, codec, resolution, fps, duration, audio stream, subtitles, and frame samples.",
    gate: "No technical blocker may remain before creative QA.",
    requiredArtifacts: ["qa/technical-report.json", "qa/frame-samples.json"],
    tools: ["ffprobe", "frame sampler", "artifact validator"],
    weight: 6,
    rollbackOnFailure: "technical_qa"
  },
  {
    index: 15,
    key: "creative_semantic_qa",
    title: "Creative and semantic QA",
    objective: "Judge final video against hook, factual accuracy, narrative, visuals, pacing, audio, subtitles, and publish readiness.",
    gate: "Creative QA must pass target tier; best-on-market requires >=9.5/10 and no critical issue.",
    requiredArtifacts: ["qa/creative-review.json"],
    tools: ["GLM", "Kimi", "GPT", "Hermes", "vision/audio review slots"],
    weight: 7,
    rollbackOnFailure: "creative_semantic_qa"
  },
  {
    index: 16,
    key: "packaging_lineage_learning",
    title: "Packaging, lineage, and learning",
    objective: "Package manifest, decisions, lineage, reusable SOPs, and learning updates.",
    gate: "All artifacts must be indexed, sanitized, and reusable learning captured.",
    requiredArtifacts: ["package/lineage.json", "learning/skill-updates.md"],
    tools: ["Learning", "AutoResearch", "manifest writer", "no-secret scan"],
    weight: 5,
    rollbackOnFailure: "packaging_lineage_learning"
  },
  {
    index: 17,
    key: "release_paperclip_monitoring",
    title: "Release, Paperclip proof, and monitoring",
    objective: "Publish/release only after proof comments, status updates, cost ledger, and monitoring hooks are complete.",
    gate: "Paperclip proof must list artifacts, checks, score, cost, and remaining blockers honestly.",
    requiredArtifacts: ["release/release-proof.json"],
    tools: ["Paperclip", "dashboard", "monitoring", "Hermes"],
    weight: 4,
    rollbackOnFailure: "release_paperclip_monitoring"
  }
];

const totalWeight = STAGE_DEFINITIONS.reduce((sum, stage) => sum + stage.weight, 0);
if (totalWeight !== 110) {
  throw new Error(`Stage weights must total 110, got ${totalWeight}`);
}
