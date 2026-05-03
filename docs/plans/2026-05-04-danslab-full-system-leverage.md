# Dan's Lab Full-System Leverage Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make the professional video pipeline use the full Dan's Lab system: Hermes plans, David/OpenClaw executes, Paperclip owns truth, Memo reports, QA gates verify, and learnings become reusable SOPs.

**Architecture:** Add an operations plan artifact to every professional-video run. The artifact maps execution lanes to proof, ownership, acceptance criteria, and escalation gates. This does not wake paid providers or droplets by itself; it gives Hermes/David a safe execution blueprint.

**Tech Stack:** Paperclip API, OpenClaw/David local executor, Memo/n8n reporting, local OpenClaude fallback, ComfyUI/Remotion/FFmpeg, Hermes skills/SOP capture.

---

## What we need beyond adapters

1. Paperclip operating spine
- Need: one master issue, child issues for voice, visuals, motion/edit, QA, reporting, and SOP capture.
- Proof: comments with artifact paths, commands, costs, blockers.

2. David/OpenClaw executor lane
- Need: local OpenClaude/OpenClaw command packet for wiring and render execution.
- Proof: command output, no-secret log, local artifact paths.

3. Memo reporting lane
- Need: fleet/video digest that renders scalar counts and exact blocker summaries, never `[object Object]`.
- Proof: formatter harness output and recent execution text.

4. Creative production lane
- Need: script, voice, style bible, storyboards, visual assets, motion timeline.
- Proof: each asset has provenance, route, cost, QA review.

5. QA/review lane
- Need: technical QA, creative QA, audio/subtitle sync, visual consistency, cost/security checks.
- Proof: `qa/final-qa.json`, `release/readiness.json`, Paperclip comment.

6. Learning/SOP lane
- Need: reusable Hermes skill or Paperclip pattern after successful integration.
- Proof: skill/reference doc path and summary.

## Execution waves

Wave 0: control and safety
- Keep paid providers disabled by default.
- Add readiness/leverage artifacts.
- Verify no secrets in generated JSON.

Wave 1: local-first toolchain
- Wire style bible importer.
- Wire FFmpeg/Remotion smoke.
- Start/verify ComfyUI if installed.

Wave 2: premium optional routes
- Add ElevenLabs Brian voice only after approved voice id and cost gate.
- Add fal/Seedance only as approved fallback, not default.

Wave 3: full professional render
- Generate only after every blocker proof exists.
- Run QA and post Paperclip proof.

Wave 4: autonomy scaling
- Create/update Paperclip issues for each lane.
- Memo digest reports readiness scalars.
- Capture reusable SOP/skill.

## Acceptance criteria
- The readiness command returns blocked when proof is missing.
- The readiness command returns queueable only when required proof files exist and paid fallback gates are satisfied.
- The plan explains how to use Paperclip, OpenClaw/David, Memo, QA, and SOP capture.
- Full tests pass.
- No secrets appear in artifacts.
