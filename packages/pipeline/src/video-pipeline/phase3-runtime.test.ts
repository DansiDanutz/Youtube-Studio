import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStrictVideoPipelineManifest,
  createVideoPipelineRuntimePlan,
  executeVideoPipelineRuntimeDryRun,
  writeStrictVideoPipelineArtifacts
} from "./index.js";

const strictInput = {
  prompt: "Create a cinematic NERVIX founder launch video showing autonomous AI agent teams producing reliable work with local-first tooling",
  videoLengthSeconds: 80,
  subtitlesEnabled: true,
  language: "en",
  voicePreset: "Brian human documentary narration",
  costMode: "local_first" as const,
  allowFalFallback: false,
  designSystem: "cinematic Vercel-grade launch cockpit"
};

test("Phase 3 creates a local-first runtime adapter plan mapped to strict production stages", () => {
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T21:00:00.000Z"));
  const plan = createVideoPipelineRuntimePlan(manifest);

  assert.equal(plan.runId, manifest.runId);
  assert.equal(plan.mode, "dry_run");
  assert.equal(plan.adapters.length, 7);
  assert.deepEqual(
    plan.adapters.map((adapter) => adapter.key),
    ["comfyui", "ffmpeg", "remotion", "narration", "subtitles", "local_video", "paid_fallback"]
  );
  assert.equal(plan.adapters.find((adapter) => adapter.key === "paid_fallback")?.enabled, false);
  assert.equal(plan.adapters.find((adapter) => adapter.key === "comfyui")?.stageKeys.includes("asset_generation"), true);
  assert.equal(plan.adapters.find((adapter) => adapter.key === "ffmpeg")?.stageKeys.includes("render_platform_exports"), true);
  assert.equal(plan.adapters.find((adapter) => adapter.key === "remotion")?.stageKeys.includes("assembly_edit_rhythm"), true);
  assert.ok(plan.executionSteps.length >= 10);
  assert.ok(plan.executionSteps.every((step) => step.status === "planned"));
  assert.doesNotMatch(JSON.stringify(plan), /sk-|Bearer\s+|apiKey|token/i);
});

test("Phase 3 enables paid fallback only when cost mode and explicit approval agree", () => {
  const manifest = createStrictVideoPipelineManifest({ ...strictInput, costMode: "allow_fal_fallback", allowFalFallback: true });
  const plan = createVideoPipelineRuntimePlan(manifest);
  const fallback = plan.adapters.find((adapter) => adapter.key === "paid_fallback");

  assert.equal(fallback?.enabled, true);
  assert.equal(fallback?.requiresApproval, true);
  assert.match(fallback?.policy ?? "", /explicit approval/i);
  assert.ok(plan.costLedger.entries.some((entry) => entry.adapterKey === "paid_fallback" && entry.approvalState === "approved"));
});

test("Phase 3 dry-run execution writes adapter manifests, routing plan, cost ledger, and no-secret proof", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-phase3-runtime-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T21:00:00.000Z"));
  const artifacts = writeStrictVideoPipelineArtifacts(root, manifest);
  const plan = createVideoPipelineRuntimePlan(manifest);
  const result = executeVideoPipelineRuntimeDryRun(root, manifest, plan);

  assert.equal(result.status, "ready_for_runtime_execution");
  assert.ok(existsSync(result.paths.runtimePlan));
  assert.ok(existsSync(result.paths.adapterRegistry));
  assert.ok(existsSync(result.paths.costLedger));
  assert.ok(existsSync(result.paths.executionReport));
  assert.ok(existsSync(artifacts.manifest));

  const runtimePlan = readFileSync(result.paths.runtimePlan, "utf8");
  assert.match(runtimePlan, /comfyui/);
  assert.match(runtimePlan, /ffmpeg/);
  assert.match(runtimePlan, /remotion/);
  assert.match(runtimePlan, /narration/);
  assert.match(runtimePlan, /subtitles/);
  assert.match(runtimePlan, /local_video/);
  assert.doesNotMatch(runtimePlan, /sk-|Bearer\s+|apiKey|token/i);

  const executionReport = JSON.parse(readFileSync(result.paths.executionReport, "utf8")) as { steps: Array<{ status: string }>; runtimeReady: boolean };
  assert.equal(executionReport.runtimeReady, true);
  assert.ok(executionReport.steps.every((step) => step.status === "dry_run_verified"));
});
