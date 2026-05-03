import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStrictVideoPipelineManifest,
  createVideoPipelineQualityPlan,
  createVideoPipelineRuntimePlan,
  executeVideoPipelineQualityDryRun,
  executeVideoPipelineRuntimeDryRun,
  writeStrictVideoPipelineArtifacts
} from "./index.js";

const strictInput = {
  prompt: "Create a cinematic NERVIX proof video showing autonomous AI agent teams coordinating research, production, verification, and Paperclip proof",
  videoLengthSeconds: 90,
  subtitlesEnabled: true,
  language: "en",
  voicePreset: "Brian human documentary narration",
  costMode: "local_first" as const,
  allowFalFallback: false,
  designSystem: "premium cinematic documentary with consistent AI-agent visual identity"
};

test("Phase 4 creates a best-on-market quality automation plan with technical, creative, sync, visual, and regeneration gates", () => {
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T22:00:00.000Z"));
  const runtimePlan = createVideoPipelineRuntimePlan(manifest);
  const qualityPlan = createVideoPipelineQualityPlan(manifest, runtimePlan);

  assert.equal(qualityPlan.runId, manifest.runId);
  assert.equal(qualityPlan.status, "planned");
  assert.equal(qualityPlan.minimumCompositeScore, 9.5);
  assert.deepEqual(
    qualityPlan.checks.map((check) => check.key),
    [
      "technical_render_validation",
      "visual_consistency",
      "audio_subtitle_sync",
      "creative_semantic_alignment",
      "regeneration_loop_readiness",
      "release_readiness"
    ]
  );
  assert.ok(qualityPlan.checks.every((check) => check.required === true));
  assert.ok(qualityPlan.checks.some((check) => check.stageKeys.includes("technical_qa")));
  assert.ok(qualityPlan.checks.some((check) => check.stageKeys.includes("creative_semantic_qa")));
  assert.ok(qualityPlan.regenerationPolicy.loopTriggers.includes("composite_score_below_9_5"));
  assert.ok(qualityPlan.regenerationPolicy.maxLoops >= 2);
  assert.doesNotMatch(JSON.stringify(qualityPlan), /sk-|Bearer\s+|apiKey|token/i);
});

test("Phase 4 dry-run writes QA reports, release readiness proof, and regeneration plan without secrets", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-phase4-quality-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T22:00:00.000Z"));
  writeStrictVideoPipelineArtifacts(root, manifest);
  const runtimePlan = createVideoPipelineRuntimePlan(manifest);
  const runtime = executeVideoPipelineRuntimeDryRun(root, manifest, runtimePlan);
  const qualityPlan = createVideoPipelineQualityPlan(manifest, runtimePlan);
  const result = executeVideoPipelineQualityDryRun(root, manifest, runtime, qualityPlan);

  assert.equal(result.status, "quality_ready_for_live_execution");
  assert.equal(result.passedCheckCount, qualityPlan.checks.length);
  assert.equal(result.compositeScore, 10);
  assert.ok(existsSync(result.paths.qualityPlan));
  assert.ok(existsSync(result.paths.technicalReport));
  assert.ok(existsSync(result.paths.visualConsistencyReport));
  assert.ok(existsSync(result.paths.audioSubtitleSyncReport));
  assert.ok(existsSync(result.paths.creativeSemanticReport));
  assert.ok(existsSync(result.paths.regenerationPlan));
  assert.ok(existsSync(result.paths.releaseReadiness));

  const releaseReadiness = JSON.parse(readFileSync(result.paths.releaseReadiness, "utf8")) as {
    releasable: boolean;
    finalBlockers: string[];
    requiredProof: string[];
  };
  assert.equal(releaseReadiness.releasable, true);
  assert.equal(releaseReadiness.finalBlockers.length, 0);
  assert.ok(releaseReadiness.requiredProof.includes("technical_report"));
  assert.ok(releaseReadiness.requiredProof.includes("creative_semantic_report"));

  const regenerationPlan = JSON.parse(readFileSync(result.paths.regenerationPlan, "utf8")) as {
    loopsRequired: number;
    actions: Array<{ rollbackStageKey: string; reason: string }>;
  };
  assert.equal(regenerationPlan.loopsRequired, 0);
  assert.equal(regenerationPlan.actions.length, 0);

  const allQaArtifacts = Object.values(result.paths).map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(allQaArtifacts, /sk-|Bearer\s+|apiKey|token/i);
});

test("Phase 4 flags regeneration when a manifest is blocked before live rendering", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-phase4-blocked-"));
  const manifest = createStrictVideoPipelineManifest({ ...strictInput, prompt: "Tiny", videoLengthSeconds: 10, costMode: "local_only", allowFalFallback: true });
  writeStrictVideoPipelineArtifacts(root, manifest);
  const runtimePlan = createVideoPipelineRuntimePlan(manifest);
  const runtime = executeVideoPipelineRuntimeDryRun(root, manifest, runtimePlan);
  const qualityPlan = createVideoPipelineQualityPlan(manifest, runtimePlan);
  const result = executeVideoPipelineQualityDryRun(root, manifest, runtime, qualityPlan);

  assert.equal(result.status, "regeneration_required");
  assert.ok(result.compositeScore < qualityPlan.minimumCompositeScore);
  assert.ok(result.failedCheckCount > 0);

  const regenerationPlan = JSON.parse(readFileSync(result.paths.regenerationPlan, "utf8")) as {
    loopsRequired: number;
    actions: Array<{ rollbackStageKey: string; reason: string }>;
  };
  assert.ok(regenerationPlan.loopsRequired > 0);
  assert.ok(regenerationPlan.actions.some((action) => action.rollbackStageKey === "job_contract_intent"));
  assert.ok(regenerationPlan.actions.some((action) => /cost|fallback|blocker|prompt/i.test(action.reason)));
});
