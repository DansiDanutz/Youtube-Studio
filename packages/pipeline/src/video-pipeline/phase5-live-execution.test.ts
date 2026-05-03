import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStrictVideoPipelineManifest,
  createVideoPipelineQualityPlan,
  createVideoPipelineRuntimePlan,
  executeVideoPipelineLiveRun,
  executeVideoPipelineQualityDryRun,
  executeVideoPipelineRuntimeDryRun,
  writeStrictVideoPipelineArtifacts
} from "./index.js";

const strictInput = {
  prompt: "Create a cinematic NERVIX production proof video showing autonomous AI agents transforming a founder prompt into verified market-ready media",
  videoLengthSeconds: 15,
  subtitlesEnabled: true,
  language: "en",
  voicePreset: "Brian human documentary narration",
  costMode: "local_first" as const,
  allowFalFallback: false,
  designSystem: "premium cinematic documentary with clear Paperclip proof panels"
};

test("Phase 5 live execution creates a real final MP4, subtitles, measured ffprobe QA, and release proof", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-phase5-live-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T23:00:00.000Z"));
  writeStrictVideoPipelineArtifacts(root, manifest);
  const runtimePlan = createVideoPipelineRuntimePlan(manifest);
  const runtime = executeVideoPipelineRuntimeDryRun(root, manifest, runtimePlan);
  const qualityPlan = createVideoPipelineQualityPlan(manifest, runtimePlan);
  const quality = executeVideoPipelineQualityDryRun(root, manifest, runtime, qualityPlan);

  const live = executeVideoPipelineLiveRun(root, manifest, runtime, quality, { allowLiveExecution: true, targetHeight: 720, targetFps: 30 });

  assert.equal(live.status, "live_execution_passed");
  assert.equal(live.cost.totalActualUsd, 0);
  assert.equal(live.measuredQa.container, "mov,mp4,m4a,3gp,3g2,mj2");
  assert.equal(live.measuredQa.video.width, 1280);
  assert.equal(live.measuredQa.video.height, 720);
  assert.equal(live.measuredQa.video.hasVideo, true);
  assert.equal(live.measuredQa.audio.hasAudio, true);
  assert.equal(live.measuredQa.subtitles.hasSubtitleFile, true);
  assert.equal(live.measuredQa.releaseReadiness.releasable, true);
  assert.ok(live.measuredQa.durationSeconds >= 14.5);

  assert.ok(existsSync(live.paths.finalVideo));
  assert.ok(statSync(live.paths.finalVideo).size > 100_000);
  assert.ok(existsSync(live.paths.subtitles));
  assert.ok(existsSync(live.paths.ffprobeReport));
  assert.ok(existsSync(live.paths.measuredQaReport));
  assert.ok(existsSync(live.paths.releaseReadiness));

  const releaseReadiness = JSON.parse(readFileSync(live.paths.releaseReadiness, "utf8")) as { finalArtifact: string; releasable: boolean; measuredProof: string[] };
  assert.equal(releaseReadiness.releasable, true);
  assert.equal(releaseReadiness.finalArtifact, live.paths.finalVideo);
  assert.ok(releaseReadiness.measuredProof.includes("ffprobe_report"));

  const textArtifacts = Object.values(live.paths)
    .filter((path): path is string => Boolean(path) && !path.endsWith(".mp4"))
    .map((path) => readFileSync(path, "utf8").toString())
    .join("\n");
  assert.doesNotMatch(textArtifacts, /sk-|Bearer\s+|apiKey|token/i);
});

test("Phase 5 refuses live execution unless the operator explicitly enables it and Phase 4 QA is clear", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-phase5-block-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T23:00:00.000Z"));
  writeStrictVideoPipelineArtifacts(root, manifest);
  const runtimePlan = createVideoPipelineRuntimePlan(manifest);
  const runtime = executeVideoPipelineRuntimeDryRun(root, manifest, runtimePlan);
  const qualityPlan = createVideoPipelineQualityPlan(manifest, runtimePlan);
  const quality = executeVideoPipelineQualityDryRun(root, manifest, runtime, qualityPlan);

  const live = executeVideoPipelineLiveRun(root, manifest, runtime, quality, { allowLiveExecution: false });

  assert.equal(live.status, "live_execution_blocked");
  assert.equal(live.blockers.some((blocker) => blocker.includes("explicit live execution approval")), true);
  assert.equal(existsSync(live.paths.finalVideo), false);
  assert.ok(existsSync(live.paths.liveExecutionReport));
});
