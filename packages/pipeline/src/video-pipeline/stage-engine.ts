import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StrictVideoPipelineInput, StrictVideoPipelineManifest, StrictVideoPipelineStage } from "./schemas.js";
import { createArtifactContract } from "./artifact-contract.js";
import { evaluateStrictGates } from "./gates.js";
import { assertNoSecrets, sanitizeForManifest } from "./no-secret.js";
import { blockersFromGateResults, computeWeightedScore } from "./scoring.js";
import { STAGE_DEFINITIONS } from "./stages.js";

export function createStrictVideoPipelineManifest(input: StrictVideoPipelineInput, now = new Date()): StrictVideoPipelineManifest {
  const normalized = normalizeStrictInput(input);
  assertNoSecrets(normalized);
  const runId = `${slugify(normalized.prompt)}-${formatStamp(now)}`;
  const outputDir = join("videos", runId);
  const gates = evaluateStrictGates(normalized);
  const hardGateStageKeys = new Set(gates.filter((gate) => gate.severity === "blocker" || gate.severity === "critical").map((gate) => gate.stageKey));
  const stages: StrictVideoPipelineStage[] = STAGE_DEFINITIONS.map((definition) => {
    const stageGates = gates.filter((gate) => gate.stageKey === definition.key);
    const hardBlocked = hardGateStageKeys.has(definition.key);
    return {
      ...definition,
      status: hardBlocked ? "looping" : "locked",
      gateResults: stageGates,
      normalizedScore: hardBlocked ? 0 : 1
    };
  });
  const score = computeWeightedScore({
    stageScores: stages.map((stage) => ({ stageKey: stage.key, normalizedScore: stage.normalizedScore })),
    blockers: blockersFromGateResults(gates),
    targetTier: "best_on_market"
  });
  const artifactContract = createArtifactContract(outputDir);
  const manifest: StrictVideoPipelineManifest = {
    runId,
    createdAt: now.toISOString(),
    outputDir,
    releaseTarget: "best_on_market",
    input: normalized,
    stages,
    gates,
    score,
    artifactContract,
    noSecretPolicy: "No raw API keys, tokens, passwords, private keys, provider secrets, or secret-derived values may enter manifests, logs, dashboard payloads, or Paperclip comments.",
    finalVideoPath: artifactContract.finalVideoPath
  };
  return sanitizeForManifest(manifest);
}

export function writeStrictVideoPipelineArtifacts(rootDir: string, manifest: StrictVideoPipelineManifest): Record<string, string> {
  assertNoSecrets(manifest);
  const outputRoot = join(rootDir, manifest.outputDir);
  for (const dir of manifest.artifactContract.requiredDirectories) {
    mkdirSync(join(outputRoot, dir), { recursive: true });
  }
  const paths: Record<string, string> = {
    manifest: join(outputRoot, "pipeline-manifest.json"),
    jobContract: join(outputRoot, "contract", "job-contract.json"),
    citationRegistry: join(outputRoot, "research", "citation-registry.json"),
    factPack: join(outputRoot, "research", "fact-pack.md"),
    gateReport: join(outputRoot, "qa", "gate-report.json")
  };
  writeJson(paths.manifest, manifest);
  writeJson(paths.jobContract, buildJobContract(manifest));
  writeJson(paths.citationRegistry, { status: "phase1_placeholder", citations: [], requiredBeforeRender: true });
  writeText(paths.factPack, `# Fact pack\n\nPrompt: ${manifest.input.prompt}\n\nPhase 1 created the research contract. Stage 1 runtime research fills citations before render.\n`);
  writeJson(paths.gateReport, { gates: manifest.gates, score: manifest.score });
  writeStagePlaceholders(outputRoot, manifest);
  return paths;
}

function writeStagePlaceholders(outputRoot: string, manifest: StrictVideoPipelineManifest): void {
  for (const stage of manifest.stages) {
    for (const relativePath of stage.requiredArtifacts) {
      const path = join(outputRoot, relativePath);
      if (relativePath.endsWith(".mp4")) {
        writeJson(join(outputRoot, "render", "export-manifest.json"), { finalVideoRequired: relativePath, status: "pending_runtime_generation" });
        continue;
      }
      mkdirSync(dirname(path), { recursive: true });
      if (relativePath.endsWith(".md") || relativePath.endsWith(".txt")) {
        writeText(path, `# ${stage.title}\n\nStatus: ${stage.status}\nGate: ${stage.gate}\n`);
      } else {
        writeJson(path, { stageKey: stage.key, title: stage.title, status: stage.status, gate: stage.gate, phase1: true });
      }
    }
  }
}

function buildJobContract(manifest: StrictVideoPipelineManifest) {
  return {
    runId: manifest.runId,
    prompt: manifest.input.prompt,
    targetLengthSeconds: manifest.input.videoLengthSeconds,
    language: manifest.input.language,
    releaseTarget: manifest.releaseTarget,
    costMode: manifest.input.costMode,
    allowFalFallback: manifest.input.allowFalFallback,
    acceptance: {
      weightedScoreMinimum: 9.5,
      allGatesPass: true,
      finalVideoRequired: true,
      noSecrets: true,
      paperclipProofRequired: true
    }
  };
}

function normalizeStrictInput(input: StrictVideoPipelineInput): StrictVideoPipelineInput {
  return {
    prompt: input.prompt.trim(),
    videoLengthSeconds: Math.max(15, Math.round(input.videoLengthSeconds || 60)),
    subtitlesEnabled: Boolean(input.subtitlesEnabled),
    language: (input.language || "en").trim(),
    voicePreset: (input.voicePreset || "elevenlabs_brian_like_human").trim(),
    costMode: input.costMode || "local_first",
    allowFalFallback: Boolean(input.allowFalFallback),
    designSystem: (input.designSystem || "cinematic premium editorial system").trim()
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sanitizeForManifest(value), null, 2)}\n`, "utf8");
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${value}\n`, "utf8");
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
  return slug || "video-pipeline";
}

function formatStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}
