import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVideoPipelineManifest, writeVideoPipelineArtifacts } from "./gsd-video-pipeline.js";

const baseInput = {
  prompt: "What is the best weekly open source framework on GitHub",
  videoLengthSeconds: 60,
  subtitlesEnabled: true,
  language: "en",
  voicePreset: "elevenlabs_brian_like_human",
  costMode: "local_first" as const,
  allowFalFallback: false,
  designSystem: "ElevenLabs cinematic dark with Vercel precision"
};

test("GSD video pipeline locks all 10 steps for a qualified prompt", () => {
  const manifest = createVideoPipelineManifest(baseInput, new Date("2026-05-03T03:00:00.000Z"));

  assert.equal(manifest.qualified, true);
  assert.equal(manifest.totalScore, 10);
  assert.equal(manifest.steps.length, 10);
  assert.equal(manifest.steps[0]?.predictiveScore, 10);
  assert.ok(manifest.outputDir.includes("what-is-the-best-weekly-open-source-framework-on-github-20260503-030000"));
  assert.ok(manifest.scenes.length >= 3);
  assert.equal(manifest.finalVideoPath.endsWith("render/final.mp4"), true);
});

test("GSD video pipeline loops step 1 when prompt readiness is below 8", () => {
  const manifest = createVideoPipelineManifest({ ...baseInput, prompt: "AI", language: "", costMode: "local_only", allowFalFallback: true });

  assert.equal(manifest.qualified, false);
  assert.equal(manifest.steps[0]?.status, "looping");
  assert.ok((manifest.steps[0]?.predictiveScore ?? 10) < 8);
  assert.ok((manifest.steps[0]?.gaps.length ?? 0) >= 2);
});

test("writeVideoPipelineArtifacts creates dashboard and step artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-video-pipeline-"));
  const manifest = createVideoPipelineManifest(baseInput, new Date("2026-05-03T03:00:00.000Z"));
  const paths = writeVideoPipelineArtifacts(root, manifest);

  assert.ok(existsSync(paths.manifest));
  assert.ok(existsSync(paths.step5));
  assert.ok(existsSync(paths.srt));
  assert.match(readFileSync(paths.skillIndex, "utf8"), /skill-step10/);
  assert.match(readFileSync(paths.dashboardJob, "utf8"), /ready_for_execution/);
});
