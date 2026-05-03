import type { GateSeverity, ReleaseTier, ScoreBlocker, WeightedScoreInput, WeightedScoreResult } from "./schemas.js";
import { STAGE_DEFINITIONS } from "./stages.js";

const TARGET_THRESHOLDS = {
  draft: 5,
  good: 7.5,
  production: 8.8,
  best_on_market: 9.5
} as const;

export function computeWeightedScore(input: WeightedScoreInput): WeightedScoreResult {
  const scoreByStage = new Map(input.stageScores.map((entry) => [entry.stageKey, clamp01(entry.normalizedScore)]));
  const totalWeight = STAGE_DEFINITIONS.reduce((sum, stage) => sum + stage.weight, 0);
  const weighted = STAGE_DEFINITIONS.reduce((sum, stage) => sum + (scoreByStage.get(stage.key) ?? 0) * stage.weight, 0);
  const weightedScore = roundToOne((weighted / totalWeight) * 10);
  const hasHardBlocker = input.blockers.some((blocker) => isHardBlocker(blocker.severity));
  const threshold = TARGET_THRESHOLDS[input.targetTier];
  const releasable = !hasHardBlocker && weightedScore >= threshold;
  return {
    weightedScore,
    targetTier: input.targetTier,
    tier: hasHardBlocker ? "blocked" : classifyTier(weightedScore),
    releasable,
    blockers: input.blockers
  };
}

function classifyTier(score: number): ReleaseTier {
  if (score >= TARGET_THRESHOLDS.best_on_market) return "best_on_market";
  if (score >= TARGET_THRESHOLDS.production) return "production";
  if (score >= TARGET_THRESHOLDS.good) return "good";
  return "draft";
}

function isHardBlocker(severity: GateSeverity): boolean {
  return severity === "blocker" || severity === "critical";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function blockersFromGateResults(gates: Array<{ severity: GateSeverity; code: string; message: string; stageKey: ScoreBlocker["stageKey"] }>): ScoreBlocker[] {
  return gates
    .filter((gate) => gate.severity === "blocker" || gate.severity === "critical")
    .map((gate) => ({ severity: gate.severity, code: gate.code, message: gate.message, stageKey: gate.stageKey }));
}
