import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProfessionalReadinessPlan,
  evaluateProfessionalReadiness,
  writeProfessionalReadinessArtifacts,
  createStrictVideoPipelineManifest,
  createSystemLeveragePlan,
  formatMemoFleetHealthDigest
} from "./index.js";

const strictInput = {
  prompt: "Explain Hermes agent inside DansLab Company with premium cinematic evidence and Paperclip proof",
  videoLengthSeconds: 900,
  subtitlesEnabled: true,
  language: "en",
  voicePreset: "Brian human documentary narration",
  costMode: "local_first" as const,
  allowFalFallback: false,
  designSystem: "Huashu x ElevenLabs cinematic dark cockpit"
};

test("professional readiness blocks queueing when required proof artifacts are missing", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-professional-readiness-missing-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-04T00:00:00.000Z"));
  const plan = createProfessionalReadinessPlan(manifest, new Date("2026-05-04T00:01:00.000Z"));
  const evaluation = evaluateProfessionalReadiness(root, manifest, plan);

  assert.equal(evaluation.queueDecision, "blocked");
  assert.ok(evaluation.blockers.includes("Missing required proof artifact: audio/voice-proof.json"));
  assert.ok(evaluation.blockers.includes("Missing required proof artifact: style/style-bible.json"));
  assert.ok(evaluation.blockers.includes("Missing required proof artifact: runtime/comfyui-smoke.json"));
  assert.ok(evaluation.blockers.includes("Missing required proof artifact: runtime/remotion-smoke.json"));
  assert.ok(evaluation.blockers.includes("Missing required proof artifact: edit/timeline.json"));
  assert.doesNotMatch(JSON.stringify(evaluation), /sk-[A-Za-z0-9]|Bearer\s+[A-Za-z0-9]|xi-api-key\s*[:=]/i);
});

test("professional readiness becomes queueable only when all local-first proof artifacts exist", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-professional-readiness-ready-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-04T00:00:00.000Z"));
  const outputRoot = join(root, manifest.outputDir);
  for (const relative of [
    "audio/voice-proof.json",
    "style/style-bible.json",
    "storyboard/shot-list.json",
    "assets/asset-manifest.json",
    "runtime/comfyui-smoke.json",
    "clips/clip-manifest.json",
    "runtime/remotion-smoke.json",
    "edit/timeline.json",
    "qa/technical-report.json",
    "qa/creative-review.json",
    "routing/actual-cost-ledger.json",
    "release/paperclip-proof.json"
  ]) {
    const target = join(outputRoot, relative);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, JSON.stringify({ ok: true, relative }), "utf8");
  }

  const plan = createProfessionalReadinessPlan(manifest, new Date("2026-05-04T00:01:00.000Z"));
  const evaluation = evaluateProfessionalReadiness(root, manifest, plan);

  assert.equal(evaluation.queueDecision, "queueable");
  assert.deepEqual(evaluation.blockers, []);
  assert.equal(evaluation.checkedProofCount, 12);
});

test("paid fallback remains blocked without explicit operator approval even if local proof exists", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-professional-readiness-paid-"));
  const manifest = createStrictVideoPipelineManifest({ ...strictInput, costMode: "allow_fal_fallback" as const, allowFalFallback: true }, new Date("2026-05-04T00:00:00.000Z"));
  const outputRoot = join(root, manifest.outputDir);
  for (const relative of [
    "audio/voice-proof.json",
    "style/style-bible.json",
    "storyboard/shot-list.json",
    "assets/asset-manifest.json",
    "runtime/comfyui-smoke.json",
    "clips/clip-manifest.json",
    "runtime/remotion-smoke.json",
    "edit/timeline.json",
    "qa/technical-report.json",
    "qa/creative-review.json",
    "routing/actual-cost-ledger.json",
    "release/paperclip-proof.json"
  ]) {
    const target = join(outputRoot, relative);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, JSON.stringify({ ok: true, relative }), "utf8");
  }
  const plan = createProfessionalReadinessPlan(manifest, new Date("2026-05-04T00:01:00.000Z"));
  const evaluation = evaluateProfessionalReadiness(root, manifest, plan);

  assert.equal(evaluation.queueDecision, "blocked");
  assert.ok(evaluation.blockers.includes("Paid fallback requested but professional provider approval proof is missing: routing/provider-approval.json"));
});

test("professional readiness refuses blocked adapter smoke artifacts even when files exist", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-professional-readiness-blocked-smoke-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-04T00:00:00.000Z"));
  const outputRoot = join(root, manifest.outputDir);
  for (const relative of [
    "audio/voice-proof.json",
    "style/style-bible.json",
    "storyboard/shot-list.json",
    "assets/asset-manifest.json",
    "runtime/comfyui-smoke.json",
    "clips/clip-manifest.json",
    "runtime/remotion-smoke.json",
    "edit/timeline.json",
    "qa/technical-report.json",
    "qa/creative-review.json",
    "routing/actual-cost-ledger.json",
    "release/paperclip-proof.json"
  ]) {
    const target = join(outputRoot, relative);
    mkdirSync(join(target, ".."), { recursive: true });
    const value = relative === "runtime/comfyui-smoke.json" ? { ok: false, status: "blocked", adapterAvailable: false } : { ok: true, relative };
    writeFileSync(target, JSON.stringify(value), "utf8");
  }

  const plan = createProfessionalReadinessPlan(manifest, new Date("2026-05-04T00:01:00.000Z"));
  const evaluation = evaluateProfessionalReadiness(root, manifest, plan);

  assert.equal(evaluation.queueDecision, "blocked");
  assert.ok(evaluation.blockers.includes("Proof artifact failed its own gate: runtime/comfyui-smoke.json"));
  assert.equal(evaluation.missingProofArtifacts.length, 0);
});

test("professional readiness artifacts include a full-system leverage plan", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-professional-readiness-write-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-04T00:00:00.000Z"));
  const readiness = createProfessionalReadinessPlan(manifest, new Date("2026-05-04T00:01:00.000Z"));
  const evaluation = evaluateProfessionalReadiness(root, manifest, readiness);
  const leverage = createSystemLeveragePlan(manifest.runId, new Date("2026-05-04T00:02:00.000Z"));
  const result = writeProfessionalReadinessArtifacts(root, manifest, readiness, evaluation, leverage);

  assert.ok(existsSync(result.paths.readinessPlan));
  assert.ok(existsSync(result.paths.readinessEvaluation));
  assert.ok(existsSync(result.paths.systemLeveragePlan));
  const written = JSON.parse(readFileSync(result.paths.systemLeveragePlan, "utf8")) as { lanes: Array<{ id: string }> };
  assert.ok(written.lanes.some((lane) => lane.id === "paperclip-source-of-truth"));
  assert.ok(written.lanes.some((lane) => lane.id === "david-openclaw-executor"));
  assert.ok(written.lanes.some((lane) => lane.id === "memo-reporting-digest"));
  assert.ok(written.lanes.some((lane) => lane.id === "learning-sop-capture"));
});

test("system leverage plan captures prioritized open-source studio upgrades from research", () => {
  const leverage = createSystemLeveragePlan("run-open-source-polish", new Date("2026-05-04T00:02:00.000Z")) as {
    openSourceEnhancements?: Array<{ id: string; name: string; priority: string; integrationLane: string }>;
  };

  assert.ok(Array.isArray(leverage.openSourceEnhancements));
  assert.ok(leverage.openSourceEnhancements.some((item) => item.id === "remotion-captions-whispercpp" && item.priority === "P0"));
  assert.ok(leverage.openSourceEnhancements.some((item) => item.id === "kokoro-local-tts" && item.integrationLane === "voice"));
  assert.ok(leverage.openSourceEnhancements.some((item) => item.id === "whisperx-or-stable-ts-alignment"));
  assert.ok(leverage.openSourceEnhancements.some((item) => item.id === "comfyui-video-workflow-registry"));
});

test("Memo fleet health digest formats nested Paperclip objects as readable scalars", () => {
  const digest = formatMemoFleetHealthDigest({
    generatedAtUtc: "2026-05-03 03:00 UTC",
    nervixStatus: "OK",
    paperclip: {
      agents: { total: 6, healthy: 5, degraded: 1 },
      tasks: { open: 14, inProgress: 4, blocked: 1, doneToday: 9 }
    }
  });

  assert.match(digest, /Fleet Health Digest/);
  assert.match(digest, /NERVIX: OK/);
  assert.match(digest, /Paperclip: Agents=6 total, 5 healthy, 1 degraded \| Tasks=14 open, 4 in progress, 1 blocked, 9 done today/);
  assert.doesNotMatch(digest, /\[object Object\]/);
});
