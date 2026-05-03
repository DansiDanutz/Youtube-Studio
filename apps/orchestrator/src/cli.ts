import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  type ReviewDecisionRecord,
  type ReviewDecisionStage,
  type ReviewReason,
  DomainError
} from "../../../packages/domain/src/index.js";
import { RunLedger } from "../../../packages/telemetry/src/index.js";
import { createControlPlane } from "./control-plane.js";
import { loadLocalEnv } from "./env.js";
import { formatRoadmapStatus } from "./roadmap.js";
import { startOrchestratorServer } from "./server.js";
import {
  createProfessionalReadinessPlan,
  createStrictVideoPipelineManifest,
  createSystemLeveragePlan,
  createVideoPipelineManifest,
  evaluateProfessionalReadiness,
  writeProfessionalReadinessArtifacts,
  writeStrictVideoPipelineArtifacts,
  writeVideoPipelineArtifacts,
  type VideoPipelineCostMode
} from "../../../packages/pipeline/src/index.js";

const rootDir = resolve(process.cwd());
const artifactsRoot = join(rootDir, "artifacts");
const ledgerPath = join(artifactsRoot, "run-ledger.sqlite");
type SmokeMode = "deterministic" | "provider";
let controlPlaneInstance: ReturnType<typeof createControlPlane> | null = null;
function getControlPlane(): ReturnType<typeof createControlPlane> {
  controlPlaneInstance ??= createControlPlane(rootDir);
  return controlPlaneInstance;
}

async function main(): Promise<void> {
  loadLocalEnv(rootDir, { optional: true });
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "submit":
    case "smoke":
      await runSmoke(rest);
      return;
    case "approve":
      await recordReviewDecision("approved", rest);
      return;
    case "reject":
      await recordReviewDecision("rejected", rest);
      return;
    case "roadmap-status":
      printRoadmapStatus(rest);
      return;
    case "server":
      await startServer(rest);
      return;
    case "video-pipeline":
      await runVideoPipeline(rest);
      return;
    case "video-professional-readiness":
      await runVideoProfessionalReadiness(rest);
      return;
    default:
      throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  }
}

async function runSmoke(args: string[]): Promise<void> {
  const fixturePath =
    resolveArg(args, "--fixture") ?? join(rootDir, "fixtures", "topics", "airplanes-one-engine-research-approved.json");
  const mode = resolveMode(resolveArg(args, "--mode"));
  const submission = await getControlPlane().submitRun(JSON.parse(readFileSync(fixturePath, "utf8")), {
    mode,
    openAiModel: resolveArg(args, "--openai-model")
  });

  console.log(`Smoke run complete: ${submission.runId}`);
  console.log(`- mode: ${mode}`);
  if (submission.model) {
    console.log(`- model: ${submission.model}`);
  }
  console.log(`- fixture: ${fixturePath}`);
  console.log(`- brief: ${submission.artifacts.brief}`);
  console.log(`- script: ${submission.artifacts.scriptJson}`);
  console.log(`- script draft: ${submission.artifacts.scriptDraft}`);
  console.log(`- review script: ${submission.artifacts.reviewScript}`);
  console.log(`- review: ${submission.artifacts.reviewHtml}`);
}

function printRoadmapStatus(args: string[]): void {
  const report = getControlPlane().getRoadmapStatus();
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatRoadmapStatus(report));
}

async function recordReviewDecision(decision: ReviewDecisionRecord["decision"], args: string[]): Promise<void> {
  const runId = requireArg(args, "--run");
  const stage = (resolveArg(args, "--stage") ?? "script") as ReviewDecisionStage;
  const reason = (resolveArg(args, "--reason") ?? "not_applicable") as ReviewReason;
  const comment =
    resolveArg(args, "--comment") ??
    (decision === "approved" ? "Approved from CLI review flow." : "Rejected from CLI review flow.");

  ensureStage(stage);

  const ledger = new RunLedger(ledgerPath);
  const now = new Date().toISOString();
  ledger.insertReviewDecision({
    runId,
    stage,
    decision,
    reason,
    comment,
    decidedAt: now
  });
  ledger.updateRunStatus({
    runId,
    status: decision === "approved" ? "approved" : "rejected",
    currentStage: stage === "final" ? "review" : stage,
    updatedAt: now
  });

  console.log(`${decision} run ${runId} at stage ${stage}`);
}

async function startServer(args: string[]): Promise<void> {
  const host = resolveArg(args, "--host") ?? process.env.ORCHESTRATOR_HOST ?? "127.0.0.1";
  const portValue = resolveArg(args, "--port") ?? process.env.ORCHESTRATOR_PORT ?? "3001";
  const port = Number.parseInt(portValue, 10);
  if (!Number.isInteger(port) || port < 0) {
    throw new Error(`Invalid port: ${portValue}`);
  }

  const orchestrator = await startOrchestratorServer({
    rootDir,
    host,
    port
  });

  console.log(`Orchestrator server listening on http://${orchestrator.host}:${orchestrator.port}`);
  await new Promise<void>(() => undefined);
}

async function runVideoPipeline(args: string[]): Promise<void> {
  const prompt = resolveArg(args, "--prompt") ?? "What is the best weekly open source framework on GitHub";
  const lengthValue = resolveArg(args, "--length") ?? "60";
  const videoLengthSeconds = Number.parseInt(lengthValue, 10);
  const costMode = (resolveArg(args, "--cost-mode") ?? "local_first") as VideoPipelineCostMode;
  const manifest = createVideoPipelineManifest({
    prompt,
    videoLengthSeconds,
    subtitlesEnabled: !args.includes("--no-subtitles"),
    language: resolveArg(args, "--language") ?? "en",
    voicePreset: resolveArg(args, "--voice") ?? "elevenlabs_brian_like_human",
    costMode,
    allowFalFallback: args.includes("--allow-fal"),
    designSystem: resolveArg(args, "--design") ?? "ElevenLabs cinematic dark with Vercel precision"
  });
  const artifacts = writeVideoPipelineArtifacts(rootDir, manifest);
  console.log(`Video pipeline manifest created: ${manifest.runId}`);
  console.log(`- score: ${manifest.totalScore}/10`);
  console.log(`- qualified: ${manifest.qualified}`);
  console.log(`- output: ${manifest.outputDir}`);
  console.log(`- manifest: ${artifacts.manifest}`);
  console.log(`- final video target: ${manifest.finalVideoPath}`);
}

async function runVideoProfessionalReadiness(args: string[]): Promise<void> {
  const prompt = resolveArg(args, "--prompt") ?? "Explain Hermes agent inside DansLab Company";
  const lengthValue = resolveArg(args, "--length") ?? "900";
  const videoLengthSeconds = Number.parseInt(lengthValue, 10);
  const costMode = (resolveArg(args, "--cost-mode") ?? "local_first") as VideoPipelineCostMode;
  const manifest = createStrictVideoPipelineManifest({
    prompt,
    videoLengthSeconds,
    subtitlesEnabled: !args.includes("--no-subtitles"),
    language: resolveArg(args, "--language") ?? "en",
    voicePreset: resolveArg(args, "--voice") ?? "Brian human documentary narration",
    costMode,
    allowFalFallback: args.includes("--allow-fal"),
    designSystem: resolveArg(args, "--design") ?? "Huashu x ElevenLabs cinematic dark cockpit"
  });
  const manifestArtifacts = writeStrictVideoPipelineArtifacts(rootDir, manifest);
  const readinessPlan = createProfessionalReadinessPlan(manifest);
  const evaluation = evaluateProfessionalReadiness(rootDir, manifest, readinessPlan);
  const leveragePlan = createSystemLeveragePlan(manifest.runId);
  const readinessArtifacts = writeProfessionalReadinessArtifacts(rootDir, manifest, readinessPlan, evaluation, leveragePlan);

  console.log(`Professional readiness checked: ${manifest.runId}`);
  console.log(`- queue decision: ${evaluation.queueDecision}`);
  console.log(`- blockers: ${evaluation.blockers.length}`);
  console.log(`- checked proofs: ${evaluation.checkedProofCount}`);
  console.log(`- output: ${manifest.outputDir}`);
  console.log(`- manifest: ${manifestArtifacts.manifest}`);
  console.log(`- readiness: ${readinessArtifacts.paths.readinessEvaluation}`);
  console.log(`- leverage plan: ${readinessArtifacts.paths.systemLeveragePlan}`);
}

function resolveArg(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function requireArg(args: string[], flag: string): string {
  const value = resolveArg(args, flag);
  if (!value) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return value;
}

function ensureStage(stage: ReviewDecisionStage): void {
  if (stage !== "brief" && stage !== "script" && stage !== "final") {
    throw new DomainError("RUN_NOT_FOUND", `Unsupported review stage: ${stage}`);
  }
}
function resolveMode(value: string | null): SmokeMode {
  if (!value || value === "deterministic") {
    return "deterministic";
  }

  if (value === "provider") {
    return "provider";
  }

  throw new Error(`Unsupported mode: ${value}`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unknown error");
  }
  process.exitCode = 1;
});
