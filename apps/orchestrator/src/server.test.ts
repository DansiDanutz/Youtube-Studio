import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startOrchestratorServer } from "./server.js";

const brief = {
  topic: "Why some planes can fly with one engine",
  audience: "curious aviation fans",
  desiredTakeaway: "Single-engine performance depends on certification, drag control, and pilot procedure.",
  stylePreset: "crisp educational",
  factPack: [
    {
      id: "fact-1",
      claim: "Modern airliners are certified to keep flying after an engine failure.",
      source: "FAA / EASA certification guidance"
    },
    {
      id: "fact-2",
      claim: "Pilots follow engine-out checklists and drift-down procedures to stay within safe limits.",
      source: "airline training manuals"
    }
  ]
};

test("server submits deterministic runs and returns run details", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "yt-server-"));
  const orchestrator = await startOrchestratorServer({ rootDir });

  try {
    const response = await fetch(`http://${orchestrator.host}:${orchestrator.port}/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        brief,
        mode: "deterministic"
      })
    });

    assert.equal(response.status, 201);
    const created = (await response.json()) as {
      runId: string;
      run: { status: string };
    };
    assert.match(created.runId, /^run-/);
    assert.equal(created.run.status, "awaiting_review");

    const detailsResponse = await fetch(`http://${orchestrator.host}:${orchestrator.port}/runs/${created.runId}`);
    assert.equal(detailsResponse.status, 200);
    const details = (await detailsResponse.json()) as {
      reviewSummary: { metadata: { mode: string } };
      stageExecutions: Array<{ stage: string }>;
    };

    assert.equal(details.reviewSummary.metadata.mode, "deterministic");
    assert.deepEqual(
      details.stageExecutions.map((execution) => execution.stage),
      ["brief", "script", "review"]
    );
  } finally {
    await orchestrator.close();
  }
});

test("server records review decisions and exposes roadmap status", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "yt-server-review-"));
  const orchestrator = await startOrchestratorServer({ rootDir });

  try {
    const createResponse = await fetch(`http://${orchestrator.host}:${orchestrator.port}/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        brief,
        mode: "deterministic"
      })
    });
    const created = (await createResponse.json()) as { runId: string };

    const decisionResponse = await fetch(
      `http://${orchestrator.host}:${orchestrator.port}/runs/${created.runId}/review-decisions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          decision: "approved",
          stage: "script",
          comment: "Looks grounded."
        })
      }
    );

    assert.equal(decisionResponse.status, 200);
    const decided = (await decisionResponse.json()) as {
      run: { status: string };
      reviewDecisions: Array<{ decision: string; comment: string }>;
    };
    assert.equal(decided.run.status, "approved");
    assert.equal(decided.reviewDecisions[0]?.decision, "approved");
    assert.equal(decided.reviewDecisions[0]?.comment, "Looks grounded.");

    const roadmapResponse = await fetch(`http://${orchestrator.host}:${orchestrator.port}/roadmap-status`);
    assert.equal(roadmapResponse.status, 200);
    const roadmap = (await roadmapResponse.json()) as { summary: { done: number; blocked: number; notStarted: number } };
    assert.equal(typeof roadmap.summary.done, "number");
    assert.equal(typeof roadmap.summary.blocked, "number");
    assert.equal(typeof roadmap.summary.notStarted, "number");
  } finally {
    await orchestrator.close();
  }
});
