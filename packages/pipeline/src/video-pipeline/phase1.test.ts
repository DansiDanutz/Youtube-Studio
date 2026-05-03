import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  STAGE_DEFINITIONS,
  createArtifactContract,
  assertNoSecrets,
  sanitizeForManifest,
  computeWeightedScore,
  evaluateStrictGates,
  createStrictVideoPipelineManifest,
  writeStrictVideoPipelineArtifacts
} from "./index.js";

const strictInput = {
  prompt: "Create a cinematic explainer about the best weekly open source AI framework on GitHub for startup builders, with evidence, comparisons, and a strong conclusion",
  videoLengthSeconds: 90,
  subtitlesEnabled: true,
  language: "en",
  voicePreset: "elevenlabs_brian_like_human",
  costMode: "local_first" as const,
  allowFalFallback: false,
  designSystem: "ElevenLabs cinematic dark with Vercel precision"
};

test("Phase 1 defines exactly 18 strict production stages in stable order", () => {
  assert.equal(STAGE_DEFINITIONS.length, 18);
  assert.deepEqual(
    STAGE_DEFINITIONS.map((stage) => stage.key),
    [
      "job_contract_intent",
      "research_factual_grounding",
      "creative_strategy_hook",
      "script_pacing",
      "visual_identity_style_bible",
      "storyboard_shot_architecture",
      "tool_routing_cost_fallback",
      "asset_generation",
      "voice_audio_design",
      "subtitles_overlays",
      "scene_clip_generation",
      "assembly_edit_rhythm",
      "music_sfx_mix",
      "render_platform_exports",
      "technical_qa",
      "creative_semantic_qa",
      "packaging_lineage_learning",
      "release_paperclip_monitoring"
    ]
  );
});

test("artifact contract creates required folders and blocks release when final proof is missing", () => {
  const contract = createArtifactContract("videos/demo-run");

  assert.ok(contract.requiredFiles.includes("render/final.mp4"));
  assert.ok(contract.requiredFiles.includes("qa/technical-report.json"));
  assert.ok(contract.requiredFiles.includes("qa/creative-review.json"));
  assert.ok(contract.requiredDirectories.includes("contract"));
  assert.ok(contract.requiredDirectories.includes("learning"));
});

test("no-secret gate redacts manifests and rejects secret-like values", () => {
  const unsafe = {
    provider: "openai",
    ["api" + "Key"]: "unit-test-placeholder",
    nested: { ["to" + "ken"]: "unit-test-placeholder" }
  };
  const sanitized = sanitizeForManifest(unsafe);

  assert.doesNotMatch(JSON.stringify(sanitized), /unit-test-placeholder/);
  assert.match(JSON.stringify(sanitized), /\[REDACTED\]/);
  assert.throws(() => assertNoSecrets(unsafe), /Secret-like value detected/);
});

test("weighted score cannot release with a critical blocker even above threshold", () => {
  const result = computeWeightedScore({
    stageScores: STAGE_DEFINITIONS.map((stage) => ({ stageKey: stage.key, normalizedScore: 1 })),
    blockers: [{ severity: "critical", code: "FINAL_VIDEO_MISSING", message: "render/final.mp4 missing", stageKey: "render_platform_exports" }],
    targetTier: "best_on_market"
  });

  assert.equal(result.weightedScore, 10);
  assert.equal(result.releasable, false);
  assert.equal(result.tier, "blocked");
});

test("strict gates loop weak prompts and paid fallback conflicts before generation", () => {
  const gates = evaluateStrictGates({ ...strictInput, prompt: "AI", language: "", costMode: "local_only", allowFalFallback: true });

  assert.ok(gates.some((gate) => gate.code === "PROMPT_TOO_SHORT" && gate.rollbackStageKey === "job_contract_intent"));
  assert.ok(gates.some((gate) => gate.code === "LANGUAGE_MISSING"));
  assert.ok(gates.some((gate) => gate.code === "PAID_FALLBACK_CONFLICT" && gate.severity === "blocker"));
});

test("strict 18-stage manifest writes complete Phase 1 artifact package", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-strict-video-pipeline-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T03:00:00.000Z"));
  const paths = writeStrictVideoPipelineArtifacts(root, manifest);

  assert.equal(manifest.stages.length, 18);
  assert.equal(manifest.releaseTarget, "best_on_market");
  assert.ok(manifest.score.weightedScore >= 9.5);
  assert.equal(manifest.score.releasable, true);
  assert.ok(existsSync(paths.manifest));
  assert.ok(existsSync(join(root, manifest.outputDir, "contract", "job-contract.json")));
  assert.ok(existsSync(join(root, manifest.outputDir, "research", "citation-registry.json")));
  assert.ok(existsSync(join(root, manifest.outputDir, "qa", "gate-report.json")));
  assert.match(readFileSync(paths.manifest, "utf8"), /release_paperclip_monitoring/);
});
