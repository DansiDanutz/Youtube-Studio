import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type ReviewDecisionResult,
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

  getRun(runId: string): RunRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, topic, status, current_stage, created_at, updated_at
         FROM runs
         WHERE id = ?`
      )
      .get(runId) as
      | {
          id: string;
          topic: string;
          status: RunRecord["status"];
          current_stage: RunRecord["currentStage"];
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      topic: row.topic,
      status: row.status,
      currentStage: row.current_stage,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  listStageExecutions(runId: string): StageExecutionRecord[] {
    return this.db
      .prepare(
        `SELECT run_id, stage, status, started_at, ended_at, latency_ms, failure_code
         FROM stage_executions
         WHERE run_id = ?
         ORDER BY started_at ASC,
           CASE stage
             WHEN 'brief' THEN 1
             WHEN 'script' THEN 2
             WHEN 'review' THEN 3
             ELSE 99
           END ASC`
      )
      .all(runId)
      .map((row) => {
        const record = row as {
          run_id: string;
          stage: StageExecutionRecord["stage"];
          status: StageExecutionRecord["status"];
          started_at: string;
          ended_at: string;
          latency_ms: number;
          failure_code: StageExecutionRecord["failureCode"];
        };

        return {
          runId: record.run_id,
          stage: record.stage,
          status: record.status,
          startedAt: record.started_at,
          endedAt: record.ended_at,
          latencyMs: record.latency_ms,
          failureCode: record.failure_code
        };
      });
  }

  listReviewDecisions(runId: string): ReviewDecisionRecord[] {
    return this.db
      .prepare(
        `SELECT run_id, stage, decision, reason, comment, decided_at
         FROM review_decisions
         WHERE run_id = ?
         ORDER BY decided_at ASC`
      )
      .all(runId)
      .map((row) => {
        const record = row as {
          run_id: string;
          stage: ReviewDecisionRecord["stage"];
          decision: ReviewDecisionResult;
          reason: ReviewDecisionRecord["reason"];
          comment: string;
          decided_at: string;
        };

        return {
          runId: record.run_id,
          stage: record.stage,
          decision: record.decision,
          reason: record.reason,
          comment: record.comment,
          decidedAt: record.decided_at
        };
      });
  }
}
