import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startOrchestratorServer } from "./server.js";

test("strict video cockpit API returns 18-stage timeline, controls, gates, scores, and artifact links", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "yt-cockpit-api-"));
  const orchestrator = await startOrchestratorServer({ rootDir });

  try {
    const response = await fetch(`http://${orchestrator.host}:${orchestrator.port}/video-pipeline/strict-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          prompt: "Create a premium NERVIX launch video for founders choosing autonomous AI agent teams",
          videoLengthSeconds: 75,
          subtitlesEnabled: true,
          language: "en",
          voicePreset: "Brian human documentary narration",
          costMode: "local_first",
          allowFalFallback: false,
          designSystem: "cinematic Vercel-grade launch cockpit"
        }
      })
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      manifest: { runId: string; stages: Array<{ key: string }> };
      cockpit: {
        runId: string;
        controls: { costMode: string; allowFalFallback: boolean; videoLengthSeconds: number; subtitlesEnabled: boolean; language: string; voicePreset: string };
        score: { weightedScore: number; releasable: boolean; targetTier: string };
        timeline: Array<{ index: number; key: string; title: string; gate: string; status: string; artifactCount: number; gateCount: number }>;
        artifactLinks: Array<{ label: string; path: string; kind: string }>;
        nextActions: string[];
        operatorWarnings: string[];
      };
      artifacts: Record<string, string>;
      runtime: { status: string; verifiedStepCount: number; paths: Record<string, string> };
      quality: { status: string; compositeScore: number; passedCheckCount: number; failedCheckCount: number; paths: Record<string, string> };
      live: { status: string; blockers: string[]; paths: Record<string, string>; cost: { totalActualUsd: number } };
    };

    assert.equal(payload.manifest.stages.length, 18);
    assert.equal(payload.cockpit.timeline.length, 18);
    assert.equal(payload.cockpit.controls.costMode, "local_first");
    assert.equal(payload.cockpit.controls.allowFalFallback, false);
    assert.equal(payload.cockpit.score.targetTier, "best_on_market");
    assert.equal(payload.cockpit.score.releasable, true);
    assert.ok(payload.cockpit.artifactLinks.some((link) => link.label === "Pipeline manifest"));
    assert.ok(payload.cockpit.artifactLinks.some((link) => link.label === "Gate report"));
    assert.ok(payload.cockpit.nextActions.includes("Review Phase 4 quality plan, release-readiness proof, and regeneration plan before any live render."));
    assert.equal(payload.cockpit.operatorWarnings.length, 0);
    assert.ok(existsSync(payload.artifacts.manifest));
    assert.ok(existsSync(payload.artifacts.gateReport));
    assert.equal(payload.runtime.status, "ready_for_runtime_execution");
    assert.ok(payload.runtime.verifiedStepCount >= 10);
    assert.ok(existsSync(payload.runtime.paths.runtimePlan));
    assert.equal(payload.quality.status, "quality_ready_for_live_execution");
    assert.equal(payload.quality.compositeScore, 10);
    assert.equal(payload.quality.failedCheckCount, 0);
    assert.equal(payload.live.status, "live_execution_blocked");
    assert.ok(payload.live.blockers.some((blocker) => blocker.includes("explicit live execution approval")));
    assert.ok(existsSync(payload.quality.paths.releaseReadiness));
    assert.ok(payload.cockpit.artifactLinks.some((link) => link.label === "Runtime adapter plan"));
    assert.ok(payload.cockpit.artifactLinks.some((link) => link.label === "Phase 4 release readiness"));
    assert.ok(payload.cockpit.artifactLinks.some((link) => link.label === "Phase 5 live execution report"));
    assert.doesNotMatch(readFileSync(payload.artifacts.manifest, "utf8"), /sk-|Bearer\s+/);
  } finally {
    await orchestrator.close();
  }
});

test("strict video cockpit API can run Phase 5 live local execution with explicit operator approval", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "yt-cockpit-phase5-"));
  const orchestrator = await startOrchestratorServer({ rootDir });

  try {
    const response = await fetch(`http://${orchestrator.host}:${orchestrator.port}/video-pipeline/strict-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          prompt: "Create a premium NERVIX Phase 5 proof video with real measured local artifact validation",
          videoLengthSeconds: 15,
          subtitlesEnabled: true,
          language: "en",
          voicePreset: "Brian human documentary narration",
          costMode: "local_first",
          allowFalFallback: false,
          designSystem: "cinematic local proof"
        },
        liveExecution: { allowLiveExecution: true, targetHeight: 720, targetFps: 30 }
      })
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      live: { status: string; paths: Record<string, string>; measuredQa: { releaseReadiness: { releasable: boolean }; video: { width: number; height: number }; audio: { hasAudio: boolean } }; cost: { totalActualUsd: number } };
      cockpit: { artifactLinks: Array<{ label: string; path: string; kind: string }> };
    };

    assert.equal(payload.live.status, "live_execution_passed");
    assert.equal(payload.live.cost.totalActualUsd, 0);
    assert.equal(payload.live.measuredQa.releaseReadiness.releasable, true);
    assert.equal(payload.live.measuredQa.video.width, 1280);
    assert.equal(payload.live.measuredQa.video.height, 720);
    assert.equal(payload.live.measuredQa.audio.hasAudio, true);
    assert.ok(existsSync(payload.live.paths.finalVideo));
    assert.ok(existsSync(payload.live.paths.ffprobeReport));
    assert.ok(existsSync(payload.live.paths.releaseReadiness));
    assert.ok(payload.cockpit.artifactLinks.some((link) => link.label === "Phase 5 final video"));
    assert.ok(payload.cockpit.artifactLinks.some((link) => link.label === "Phase 5 measured QA report"));
  } finally {
    await orchestrator.close();
  }
});

test("strict video cockpit blocks unsafe cost fallback conflicts with operator warnings", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "yt-cockpit-block-"));
  const orchestrator = await startOrchestratorServer({ rootDir });

  try {
    const response = await fetch(`http://${orchestrator.host}:${orchestrator.port}/video-pipeline/strict-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          prompt: "Tiny",
          videoLengthSeconds: 10,
          subtitlesEnabled: true,
          language: "en",
          voicePreset: "Brian human documentary narration",
          costMode: "local_only",
          allowFalFallback: true,
          designSystem: "cinematic"
        }
      })
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      cockpit: { score: { releasable: boolean }; operatorWarnings: string[]; timeline: Array<{ status: string; gateCount: number }> };
    };
    assert.equal(payload.cockpit.score.releasable, false);
    assert.ok(payload.cockpit.operatorWarnings.some((warning) => warning.includes("PAID_FALLBACK_CONFLICT")));
    assert.ok(payload.cockpit.timeline.some((stage) => stage.status === "looping" && stage.gateCount > 0));
  } finally {
    await orchestrator.close();
  }
});

test("dashboard exposes Phase 2 strict cockpit controls and 18-stage timeline rendering", () => {
  const html = readFileSync(resolve("apps/dashboard/index.html"), "utf8");
  assert.match(html, /18-stage strict video pipeline/i);
  assert.match(html, /best-on-market/i);
  assert.match(html, /advanced-options/i);
  assert.match(html, /strict-runs/);
  assert.match(html, /renderStrictTimeline/);
  assert.match(html, /artifactLinks/);
  assert.match(html, /operatorWarnings/);
});
