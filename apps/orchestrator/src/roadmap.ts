import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type RoadmapTaskStatus = "done" | "blocked" | "not_started";

export interface RoadmapTask {
  phase: string;
  title: string;
  status: RoadmapTaskStatus;
  note: string;
}

export interface RoadmapStatusReport {
  generatedAt: string;
  summary: {
    done: number;
    blocked: number;
    notStarted: number;
  };
  tasks: RoadmapTask[];
}

interface ReviewSummaryLike {
  metadata?: {
    mode?: string;
  };
}

function hasProviderRequestFailure(artifactsRoot: string): boolean {
  const dbPath = join(artifactsRoot, "run-ledger.sqlite");
  if (!existsSync(dbPath)) {
    return false;
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare(
        `SELECT 1
         FROM stage_executions
         WHERE failure_code = 'PROVIDER_REQUEST_FAILED'
         LIMIT 1`
      )
      .get() as { 1?: number } | undefined;
    return Boolean(row);
  } finally {
    db.close();
  }
}

function hasPath(rootDir: string, relativePath: string): boolean {
  return existsSync(join(rootDir, relativePath));
}

function findReviewSummaries(artifactsRoot: string): ReviewSummaryLike[] {
  const runsDir = join(artifactsRoot, "runs");
  if (!existsSync(runsDir)) {
    return [];
  }

  const summaries: ReviewSummaryLike[] = [];
  for (const entry of readdirSync(runsDir)) {
    const runDir = join(runsDir, entry);
    if (!statSync(runDir).isDirectory()) {
      continue;
    }
    const summaryPath = join(runDir, "review", "review-summary.json");
    if (!existsSync(summaryPath)) {
      continue;
    }

    summaries.push(JSON.parse(readFileSync(summaryPath, "utf8")) as ReviewSummaryLike);
  }

  return summaries;
}

export function computeRoadmapStatus(rootDir: string, env: NodeJS.ProcessEnv = process.env): RoadmapStatusReport {
  const artifactsRoot = join(rootDir, "artifacts");
  const reviewSummaries = findReviewSummaries(artifactsRoot);
  const hasDeterministicRun = reviewSummaries.some((summary) => summary.metadata?.mode === "deterministic");
  const hasProviderRun = reviewSummaries.some((summary) => summary.metadata?.mode === "provider");
  const hasOpenAiKey = Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0);
  const providerRequestFailed = hasProviderRequestFailure(artifactsRoot);

  const tasks: RoadmapTask[] = [
    {
      phase: "Phase 1",
      title: "Finalize the core run model",
      status:
        hasPath(rootDir, "packages/domain/src/index.ts") &&
        hasPath(rootDir, "packages/telemetry/src/index.ts") &&
        hasPath(rootDir, "apps/orchestrator/src/cli.ts")
          ? "done"
          : "not_started",
      note: "Run records, stage execution logging, review decisions, and the orchestrator CLI exist in the repo."
    },
    {
      phase: "Phase 1",
      title: "Initialize the implementation repo properly",
      status:
        hasPath(rootDir, "package.json") &&
        hasPath(rootDir, "pnpm-workspace.yaml") &&
        hasPath(rootDir, "README.md") &&
        hasPath(rootDir, "ROADMAP.md")
          ? "done"
          : "not_started",
      note: "The workspace, package metadata, docs, and planning artifacts are present."
    },
    {
      phase: "Phase 1",
      title: "Ship brief review and script review",
      status:
        hasPath(rootDir, "packages/pipeline/src/brief.ts") &&
        hasPath(rootDir, "packages/pipeline/src/script/index.ts") &&
        hasPath(rootDir, "packages/pipeline/src/review.ts")
          ? "done"
          : "not_started",
      note: "The current implementation produces brief/script artifacts and a review package for manual approval."
    },
    {
      phase: "Phase 1",
      title: "Ship one deterministic end-to-end Shorts lane",
      status: hasDeterministicRun ? "done" : "not_started",
      note: hasDeterministicRun
        ? "A deterministic smoke run review package exists under artifacts/runs."
        : "No deterministic smoke run artifact has been recorded yet."
    },
    {
      phase: "Phase 1",
      title: "Validate provider-backed script generation",
      status: hasProviderRun ? "done" : hasOpenAiKey ? (providerRequestFailed ? "blocked" : "not_started") : "blocked",
      note: hasProviderRun
        ? "A provider-mode review package exists under artifacts/runs."
        : hasOpenAiKey && providerRequestFailed
          ? "OPENAI_API_KEY is present, but the latest provider request failed upstream, so this gate is externally blocked until billing or quota is restored."
        : hasOpenAiKey
          ? "OPENAI_API_KEY is present, but no provider-mode run artifact has been recorded yet."
          : "OPENAI_API_KEY is missing, so the live provider smoke gate in the backlog cannot pass yet."
    },
    {
      phase: "Phase 2",
      title: "Add narration generation",
      status: "not_started",
      note: "No voice stage implementation exists in apps/ or packages/ yet."
    },
    {
      phase: "Phase 2",
      title: "Add caption alignment",
      status: "not_started",
      note: "No caption stage implementation exists in apps/ or packages/ yet."
    },
    {
      phase: "Phase 2",
      title: "Add shot planning",
      status: "not_started",
      note: "Shot planning is documented, but there is no executable lane yet."
    },
    {
      phase: "Phase 2",
      title: "Add asset generation",
      status: "not_started",
      note: "Asset generation is still roadmap-only in the current repo."
    },
    {
      phase: "Phase 2",
      title: "Add render and packaging",
      status: "not_started",
      note: "There is no render or packaging stage implementation yet."
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      done: tasks.filter((task) => task.status === "done").length,
      blocked: tasks.filter((task) => task.status === "blocked").length,
      notStarted: tasks.filter((task) => task.status === "not_started").length
    },
    tasks
  };
}

export function formatRoadmapStatus(report: RoadmapStatusReport): string {
  const lines = [
    `Roadmap status generated at ${report.generatedAt}`,
    `Done: ${report.summary.done} | Blocked: ${report.summary.blocked} | Not started: ${report.summary.notStarted}`,
    ""
  ];

  for (const task of report.tasks) {
    lines.push(`[${task.phase}] ${task.title}`);
    lines.push(`- status: ${task.status}`);
    lines.push(`- note: ${task.note}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
