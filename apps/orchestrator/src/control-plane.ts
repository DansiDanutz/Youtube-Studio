import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  type BriefInput,
  type FailureCode,
  type ReviewDecisionRecord,
  type ReviewSummary,
  type RunMode,
  type RunRecord,
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
import { loadLocalEnv } from "./env.js";
import { computeRoadmapStatus } from "./roadmap.js";

export interface RunDetails {
  run: RunRecord;
  stageExecutions: ReturnType<RunLedger["listStageExecutions"]>;
  reviewDecisions: ReturnType<RunLedger["listReviewDecisions"]>;
  reviewSummary: ReviewSummary | null;
  artifacts: Record<string, string>;
}

export interface SubmitRunOptions {
  mode?: RunMode;
  openAiModel?: string | null;
}

export interface SubmittedRun {
  runId: string;
  mode: RunMode;
  model: string | null;
  artifacts: Record<string, string>;
}

export interface ReviewDecisionInput {
  decision: ReviewDecisionRecord["decision"];
  stage?: ReviewDecisionRecord["stage"];
  reason?: ReviewDecisionRecord["reason"];
  comment?: string;
}

export function createControlPlane(rootDir: string) {
  loadLocalEnv(rootDir, { optional: true });

  const artifactsRoot = join(rootDir, "artifacts");
  const ledgerPath = join(artifactsRoot, "run-ledger.sqlite");
  const ledger = new RunLedger(ledgerPath);

  return {
    async submitRun(input: BriefInput, options: SubmitRunOptions = {}): Promise<SubmittedRun> {
      const mode = options.mode ?? "deterministic";
      const providerModel = mode === "provider" ? resolveOpenAiModel(options.openAiModel ?? undefined) : null;
      const now = new Date().toISOString();
      const runId = `run-${randomUUID()}`;
      const runRoot = join(artifactsRoot, "runs", runId);
      const artifactPaths = buildArtifactPaths(runRoot);

      ledger.insertRun({
        id: runId,
        topic: input.topic.trim(),
        status: "in_progress",
        currentStage: "brief",
        createdAt: now,
        updatedAt: now
      });

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

      const summary = buildReviewSummary({
        runId,
        topic: brief.topic,
        artifacts: [
          { kind: "brief", path: artifactPaths.brief },
          { kind: "script", path: artifactPaths.scriptJson },
          { kind: "script", path: artifactPaths.reviewScript },
          { kind: "review", path: artifactPaths.reviewHtml }
        ],
        mode,
        briefNormalization,
        scriptGeneration,
        model: providerModel,
        groundingStatus: "verified"
      });

      await executeStage(ledger, runId, "review", async () => {
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

      return {
        runId,
        mode,
        model: providerModel,
        artifacts: artifactPaths
      };
    },

    getRun(runId: string): RunDetails | null {
      const run = ledger.getRun(runId);
      if (!run) {
        return null;
      }

      const artifacts = buildArtifactPaths(join(artifactsRoot, "runs", runId));
      return {
        run,
        stageExecutions: ledger.listStageExecutions(runId),
        reviewDecisions: ledger.listReviewDecisions(runId),
        reviewSummary: readJsonFile<ReviewSummary>(artifacts.reviewSummary),
        artifacts
      };
    },

    recordReviewDecision(runId: string, input: ReviewDecisionInput): RunDetails {
      const stage = input.stage ?? "script";
      const reason = input.reason ?? "not_applicable";
      const comment =
        input.comment ??
        (input.decision === "approved" ? "Approved from control-plane API." : "Rejected from control-plane API.");
      const now = new Date().toISOString();

      ledger.insertReviewDecision({
        runId,
        stage,
        decision: input.decision,
        reason,
        comment,
        decidedAt: now
      });
      ledger.updateRunStatus({
        runId,
        status: input.decision === "approved" ? "approved" : "rejected",
        currentStage: stage === "final" ? "review" : stage,
        updatedAt: now
      });

      const details = this.getRun(runId);
      if (!details) {
        throw new Error(`Run ${runId} was not found after recording the decision.`);
      }
      return details;
    },

    getRoadmapStatus(env: NodeJS.ProcessEnv = process.env) {
      return computeRoadmapStatus(rootDir, env);
    }
  };
}

async function executeStage<T>(
  ledger: RunLedger,
  runId: string,
  stage: RunRecord["currentStage"],
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
      failureCode: error instanceof DomainError ? (error.failureCode as FailureCode) : null
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

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8")) as T;
}
