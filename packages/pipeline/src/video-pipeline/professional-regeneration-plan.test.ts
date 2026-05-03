import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMacStudioToolAuditFromVerifiedEvidence,
  createProfessionalRegenerationPlan,
  createStrictVideoPipelineManifest,
  writeProfessionalRegenerationPlanArtifacts,
  writeStrictVideoPipelineArtifacts
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

test("professional regeneration plan blocks final render when premium voice, ComfyUI, Remotion, and design wiring are not proven", () => {
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T23:30:00.000Z"));
  const audit = buildMacStudioToolAuditFromVerifiedEvidence();
  const plan = createProfessionalRegenerationPlan(manifest, audit, new Date("2026-05-03T23:35:00.000Z"));

  assert.equal(plan.releaseDecision, "blocked");
  assert.equal(plan.paperclipProofRequired, true);
  assert.ok(plan.gaps.some((gap) => gap.code === "VOICE_NOT_PROFESSIONAL_LIVE" && gap.severity === "blocker"));
  assert.ok(plan.gaps.some((gap) => gap.code === "COMFYUI_NOT_SERVING" && gap.severity === "blocker"));
  assert.ok(plan.gaps.some((gap) => gap.code === "REMOTION_NOT_WIRED" && gap.severity === "blocker"));
  assert.ok(plan.steps.some((step) => step.id === "full-professional-render"));
  assert.doesNotMatch(JSON.stringify(plan), /sk-[A-Za-z0-9]|Bearer\s+[A-Za-z0-9]|xi-api-key\s*[:=]/i);
});

test("professional regeneration plan writes audit, gap, and plan artifacts inside the run directory", () => {
  const root = mkdtempSync(join(tmpdir(), "yt-professional-plan-"));
  const manifest = createStrictVideoPipelineManifest(strictInput, new Date("2026-05-03T23:30:00.000Z"));
  writeStrictVideoPipelineArtifacts(root, manifest);
  const plan = createProfessionalRegenerationPlan(manifest, buildMacStudioToolAuditFromVerifiedEvidence(), new Date("2026-05-03T23:35:00.000Z"));
  const result = writeProfessionalRegenerationPlanArtifacts(root, manifest, plan);

  assert.ok(existsSync(result.paths.plan));
  assert.ok(existsSync(result.paths.toolAudit));
  assert.ok(existsSync(result.paths.gaps));
  const writtenPlan = JSON.parse(readFileSync(result.paths.plan, "utf8")) as { releaseDecision: string; finalDecision: string };
  assert.equal(writtenPlan.releaseDecision, "blocked");
  assert.match(writtenPlan.finalDecision, /Do not regenerate/);
});
