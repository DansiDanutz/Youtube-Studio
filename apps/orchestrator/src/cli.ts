import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  type BriefInput,
  type ReviewDecisionRecord,
  type ReviewDecisionStage,
  type ReviewReason,
  type RunRecord,
  type Stage,
  DomainError
} from "../../../packages/domain/src/index.js";
import {
  buildArtifactPaths,
  buildReviewSummary,
  generateScript,
  generateScriptWithProvider,
  normalizeBrief,
  normalizeBriefWithProvider,
  requestOpenAiStructuredOutput,
  renderReviewHtml,
  renderScriptMarkdown,
  resolveOpenAiModel,
  validateBrief,
  writeJson,
  writeText
} from "../../../packages/pipeline/src/index.js";
import { RunLedger } from "../../../packages/telemetry/src/index.js";

const rootDir = resolve(process.cwd());
const artifactsRoot = join(rootDir, "artifacts");
const ledgerPath = join(artifactsRoot, "run-ledger.sqlite");
type SmokeMode = "deterministic" | "provider";

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "smoke":
      await runSmoke(rest);
      return;
    case "approve":
      await recordReviewDecision("approved", rest);
      return;
    case "reject":
      await recordReviewDecision("rejected", rest);
      return;
    default:
      throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  }
}

async function runSmoke(args: string[]): Promise<void> {
  const fixturePath =
    resolveArg(args, "--fixture") ?? join(rootDir, "fixtures", "topics", "airplanes-one-engine-research-approved.json");
  const mode = resolveMode(resolveArg(args, "--mode"));
  const providerModel = mode === "provider" ? resolveOpenAiModel(resolveArg(args, "--openai-model")) : null;
  const now = new Date().toISOString();
  const runId = `run-${randomUUID()}`;
  const runRoot = join(artifactsRoot, "runs", runId);
  const artifactPaths = buildArtifactPaths(runRoot);
  const ledger = new RunLedger(ledgerPath);
  const input = JSON.parse(readFileSync(fixturePath, "utf8")) as BriefInput;

  const runRecord: RunRecord = {
    id: runId,
    topic: input.topic.trim(),
    status: "in_progress",
    currentStage: "brief",
    createdAt: now,
    updatedAt: now
  };

  ledger.insertRun(runRecord);
  const briefNormalization = mode === "provider" ? "openai" : "local";
  const scriptGeneration = mode === "provider" ? "openai" : "deterministic";
  const brief = await executeStage(ledger, runId, "brief", async () => {
    const normalizedBrief =
      mode === "provider"
        ? await normalizeBriefWithProvider(input, {
            model: providerModel ?? resolveOpenAiModel(),
            requestStructuredOutput: requestOpenAiStructuredOutput
          })
        : normalizeBrief(input);
    validateBrief(normalizedBrief);
    return normalizedBrief;
  });
  const script = await executeStage(ledger, runId, "script", async () =>
    mode === "provider"
      ? generateScriptWithProvider(brief, {
          model: providerModel ?? resolveOpenAiModel(),
          requestStructuredOutput: requestOpenAiStructuredOutput
        })
      : Promise.resolve(generateScript(brief))
  );

  const artifacts = [
    { kind: "brief" as const, path: artifactPaths.brief },
    { kind: "script" as const, path: artifactPaths.scriptJson },
    { kind: "script" as const, path: artifactPaths.reviewScript },
    { kind: "review" as const, path: artifactPaths.reviewHtml }
  ];
  const summary = buildReviewSummary({
    runId,
    topic: brief.topic,
    artifacts,
    mode,
    briefNormalization,
    scriptGeneration,
    model: providerModel,
    groundingStatus: "verified"
  });

  await executeStage(ledger, runId, "review", async () => {
    mkdirSync(runRoot, { recursive: true });
    writeJson(artifactPaths.brief, brief);
    writeJson(artifactPaths.scriptJson, script);
    writeText(artifactPaths.scriptDraft, renderScriptMarkdown(script, brief));
    writeText(artifactPaths.reviewScript, renderScriptMarkdown(script, brief));
    writeJson(artifactPaths.reviewSummary, summary);
    writeText(artifactPaths.reviewHtml, renderReviewHtml({ brief, script, summary }));
  });

  ledger.updateRunStatus({
    runId,
    status: "awaiting_review",
    currentStage: "review",
    updatedAt: new Date().toISOString()
  });

  console.log(`Smoke run complete: ${runId}`);
  console.log(`- mode: ${mode}`);
  if (providerModel) {
    console.log(`- model: ${providerModel}`);
  }
  console.log(`- fixture: ${fixturePath}`);
  console.log(`- brief: ${artifactPaths.brief}`);
  console.log(`- script: ${artifactPaths.scriptJson}`);
  console.log(`- script draft: ${artifactPaths.scriptDraft}`);
  console.log(`- review script: ${artifactPaths.reviewScript}`);
  console.log(`- review: ${artifactPaths.reviewHtml}`);
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
    currentStage: stage === "final" ? "review" : (stage as Stage),
    updatedAt: now
  });

  console.log(`${decision} run ${runId} at stage ${stage}`);
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

async function executeStage<T>(
  ledger: RunLedger,
  runId: string,
  stage: Stage,
  action: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await action();
    const endedAt = Date.now();
    ledger.insertStageExecution({
      runId,
      stage,
      status: "succeeded",
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      latencyMs: endedAt - startedAt,
      failureCode: null
    });
    return result;
  } catch (error) {
    const endedAt = Date.now();
    ledger.insertStageExecution({
      runId,
      stage,
      status: "failed",
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      latencyMs: endedAt - startedAt,
      failureCode: error instanceof DomainError ? error.failureCode : null
    });
    ledger.updateRunStatus({
      runId,
      status: "rejected",
      currentStage: stage,
      updatedAt: new Date(endedAt).toISOString()
    });
    throw error;
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
