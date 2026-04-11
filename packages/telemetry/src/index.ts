import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type ReviewDecisionRecord,
  type RunRecord,
  type StageExecutionRecord,
  DomainError
} from "../../../packages/domain/src/index.js";

export class RunLedger {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stage_executions (
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        failure_code TEXT,
        PRIMARY KEY (run_id, stage, started_at)
      );
      CREATE TABLE IF NOT EXISTS review_decisions (
        run_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        comment TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        PRIMARY KEY (run_id, stage, decided_at)
      );
    `);
  }

  insertRun(run: RunRecord): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, topic, status, current_stage, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(run.id, run.topic, run.status, run.currentStage, run.createdAt, run.updatedAt);
  }

  updateRunStatus(args: {
    runId: string;
    status: RunRecord["status"];
    currentStage: RunRecord["currentStage"];
    updatedAt: string;
  }): void {
    const result = this.db
      .prepare(`UPDATE runs SET status = ?, current_stage = ?, updated_at = ? WHERE id = ?`)
      .run(args.status, args.currentStage, args.updatedAt, args.runId);

    if (result.changes === 0) {
      throw new DomainError("RUN_NOT_FOUND", `Run ${args.runId} was not found in the ledger.`);
    }
  }

  insertStageExecution(stageExecution: StageExecutionRecord): void {
    this.db
      .prepare(
        `INSERT INTO stage_executions (run_id, stage, status, started_at, ended_at, latency_ms, failure_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        stageExecution.runId,
        stageExecution.stage,
        stageExecution.status,
        stageExecution.startedAt,
        stageExecution.endedAt,
        stageExecution.latencyMs,
        stageExecution.failureCode
      );
  }

  insertReviewDecision(decision: ReviewDecisionRecord): void {
    this.db
      .prepare(
        `INSERT INTO review_decisions (run_id, stage, decision, reason, comment, decided_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(decision.runId, decision.stage, decision.decision, decision.reason, decision.comment, decision.decidedAt);
  }
}
