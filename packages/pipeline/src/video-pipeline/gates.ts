import type { StrictVideoPipelineInput, VideoPipelineGateResult } from "./schemas.js";

export function evaluateStrictGates(input: StrictVideoPipelineInput): VideoPipelineGateResult[] {
  const normalizedPrompt = input.prompt.trim();
  const gates: VideoPipelineGateResult[] = [];
  if (normalizedPrompt.length < 12) {
    gates.push({
      stageKey: "job_contract_intent",
      code: "PROMPT_TOO_SHORT",
      message: "Prompt is too short to create a senior-grade production contract.",
      severity: "blocker",
      rollbackStageKey: "job_contract_intent"
    });
  }
  if (normalizedPrompt.split(/\s+/).filter(Boolean).length < 6) {
    gates.push({
      stageKey: "job_contract_intent",
      code: "PROMPT_UNDERSPECIFIED",
      message: "Prompt needs subject, target audience, output format, and desired angle.",
      severity: "blocker",
      rollbackStageKey: "job_contract_intent"
    });
  }
  if (!input.language.trim()) {
    gates.push({
      stageKey: "voice_audio_design",
      code: "LANGUAGE_MISSING",
      message: "Language is required for narration, subtitles, pronunciation, and QA.",
      severity: "blocker",
      rollbackStageKey: "job_contract_intent"
    });
  }
  if (!Number.isFinite(input.videoLengthSeconds) || input.videoLengthSeconds < 15) {
    gates.push({
      stageKey: "script_pacing",
      code: "VIDEO_LENGTH_TOO_SHORT",
      message: "Video length must be at least 15 seconds for the strict pipeline.",
      severity: "blocker",
      rollbackStageKey: "job_contract_intent"
    });
  }
  if (input.costMode === "local_only" && input.allowFalFallback) {
    gates.push({
      stageKey: "tool_routing_cost_fallback",
      code: "PAID_FALLBACK_CONFLICT",
      message: "Local-only mode conflicts with fal.ai or paid fallback approval.",
      severity: "blocker",
      rollbackStageKey: "tool_routing_cost_fallback"
    });
  }
  if (input.costMode === "allow_fal_fallback" && !input.allowFalFallback) {
    gates.push({
      stageKey: "tool_routing_cost_fallback",
      code: "FALLBACK_MODE_WITHOUT_APPROVAL",
      message: "Fallback mode requires explicit fallback approval flag.",
      severity: "blocker",
      rollbackStageKey: "tool_routing_cost_fallback"
    });
  }
  return gates;
}
