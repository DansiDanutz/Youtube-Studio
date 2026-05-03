import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { computeRoadmapStatus, formatRoadmapStatus } from "./roadmap.js";

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("computeRoadmapStatus reports phase 1 progress from repo evidence", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "yt-roadmap-"));
  mkdirSync(join(rootDir, "apps", "orchestrator", "src"), { recursive: true });
  mkdirSync(join(rootDir, "packages", "domain", "src"), { recursive: true });
  mkdirSync(join(rootDir, "packages", "telemetry", "src"), { recursive: true });
  mkdirSync(join(rootDir, "packages", "pipeline", "src"), { recursive: true });
  mkdirSync(join(rootDir, "artifacts", "runs", "run-1", "review"), { recursive: true });

  writeFileSync(join(rootDir, "package.json"), "{}\n", "utf8");
  writeFileSync(join(rootDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  writeFileSync(join(rootDir, "README.md"), "# test\n", "utf8");
  writeFileSync(join(rootDir, "ROADMAP.md"), "# roadmap\n", "utf8");
  writeFileSync(join(rootDir, "apps", "orchestrator", "src", "cli.ts"), "// cli\n", "utf8");
  writeFileSync(join(rootDir, "packages", "domain", "src", "index.ts"), "// domain\n", "utf8");
  writeFileSync(join(rootDir, "packages", "telemetry", "src", "index.ts"), "// telemetry\n", "utf8");
  writeFileSync(join(rootDir, "packages", "pipeline", "src", "brief.ts"), "// brief\n", "utf8");
  writeFileSync(join(rootDir, "packages", "pipeline", "src", "review.ts"), "// review\n", "utf8");
  mkdirSync(join(rootDir, "packages", "pipeline", "src", "script"), { recursive: true });
  writeFileSync(join(rootDir, "packages", "pipeline", "src", "script", "index.ts"), "// script\n", "utf8");
  writeJson(join(rootDir, "artifacts", "runs", "run-1", "review", "review-summary.json"), {
    metadata: { mode: "deterministic" }
  });

  const report = computeRoadmapStatus(rootDir, {});
  const deterministicLane = report.tasks.find((task) => task.title === "Ship one deterministic end-to-end Shorts lane");
  const providerValidation = report.tasks.find((task) => task.title === "Validate provider-backed script generation");

  assert.ok(deterministicLane);
  assert.equal(deterministicLane.status, "done");
  assert.ok(providerValidation);
  assert.equal(providerValidation.status, "blocked");
  assert.match(formatRoadmapStatus(report), /Done: \d+ \| Blocked: \d+ \| Not started: \d+/);
});

test("computeRoadmapStatus marks provider validation done when a provider run exists", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "yt-roadmap-provider-"));
  mkdirSync(join(rootDir, "artifacts", "runs", "run-2", "review"), { recursive: true });
  writeJson(join(rootDir, "artifacts", "runs", "run-2", "review", "review-summary.json"), {
    metadata: { mode: "provider" }
  });

  const report = computeRoadmapStatus(rootDir, {});
  const providerValidation = report.tasks.find((task) => task.title === "Validate provider-backed script generation");

  assert.ok(providerValidation);
  assert.equal(providerValidation.status, "done");
});
