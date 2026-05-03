# Market-Leading Video Pipeline Implementation Plan

> For Hermes: Use this plan after the senior blueprint. Do not deploy before the strict engine, gates, artifacts, and dashboard timeline are implemented and verified.

Goal: upgrade the existing 10-step prototype into an 18-stage production-grade prompt-to-video engine.

Architecture: TypeScript core pipeline package owns schemas, stages, gates, scoring, artifact contracts, and routing decisions. Orchestrator owns runtime adapters. Dashboard presents the stage timeline and operator controls. Paperclip remains proof/source of truth.

Tech Stack: TypeScript, Node 22, Remotion/FFmpeg adapters, ComfyUI adapter interface, Vercel dashboard proxy, Paperclip API, local-first model routing.

---

## Phase 1 — Strict core engine, no external generation yet

### Task 1: Add production pipeline schema module

Objective: define the 18-stage model and strict data contracts.

Files:
- Create: `packages/pipeline/src/video-pipeline/schemas.ts`
- Modify: `packages/pipeline/src/index.ts`
- Test: `packages/pipeline/src/video-pipeline/schemas.test.ts`

Steps:
1. Define `VideoPipelineStageKey` for 18 stages.
2. Define `VideoPipelineStage`, `VideoPipelineGateResult`, `VideoPipelineArtifact`, `VideoPipelineScoreBreakdown`, `VideoPipelineRun`.
3. Export from package index.
4. Add tests proving all 18 stages exist exactly once.

Verification:
- `pnpm run build`
- `pnpm run test`

### Task 2: Add artifact contract

Objective: standardize every output folder and required artifact.

Files:
- Create: `packages/pipeline/src/video-pipeline/artifact-contract.ts`
- Test: `packages/pipeline/src/video-pipeline/artifact-contract.test.ts`

Steps:
1. Add canonical artifact paths for stages 0-18.
2. Add `createRunArtifactIndex()`.
3. Add `validateRequiredArtifacts()`.
4. Add tests for missing artifact failures.

Verification:
- missing `render/final.mp4` blocks release.
- missing `qa/creative-review.json` blocks production.

### Task 3: Add no-secret sanitizer and manifest safety gate

Objective: prevent secret leakage in manifests, logs, comments, and dashboard payloads.

Files:
- Create: `packages/pipeline/src/video-pipeline/no-secret.ts`
- Test: `packages/pipeline/src/video-pipeline/no-secret.test.ts`

Steps:
1. Add redaction patterns for API keys/tokens/passwords/private keys.
2. Add `sanitizeForManifest()`.
3. Add `assertNoSecrets()` gate.
4. Tests must prove secret-like strings are blocked/redacted.

Verification:
- no-secret test intentionally injects fake `sk-...` and fails gate.

### Task 4: Add weighted scoring engine

Objective: replace simple 10/10 locking with weighted quality scoring plus hard blockers.

Files:
- Create: `packages/pipeline/src/video-pipeline/scoring.ts`
- Test: `packages/pipeline/src/video-pipeline/scoring.test.ts`

Steps:
1. Implement weights from blueprint.
2. Add release tiers: draft, good, production, best_on_market.
3. Ensure critical blocker overrides high score.
4. Add tests.

Verification:
- score 9.8 with critical blocker is not releasable.
- score 9.5 with all gates passes best-on-market.

### Task 5: Add strict gate framework

Objective: every stage returns measurable pass/fail diagnostics.

Files:
- Create: `packages/pipeline/src/video-pipeline/gates.ts`
- Test: `packages/pipeline/src/video-pipeline/gates.test.ts`

Steps:
1. Add gate severity: info/warn/blocker/critical.
2. Add rollback target per failure.
3. Add gates: prompt specificity, citation coverage, duration estimate, cost cap, artifact existence, no-secret, final file exists.
4. Add tests.

Verification:
- weak prompt loops to Stage 0/1.
- unsupported claims loop to Stage 1.
- paid fallback without approval blocks Stage 6/10.

### Task 6: Replace prototype manifest factory with 18-stage engine

Objective: generate a complete strict run package from prompt.

Files:
- Modify: `packages/pipeline/src/gsd-video-pipeline.ts`
- Or create: `packages/pipeline/src/video-pipeline/stage-engine.ts`
- Test: update `packages/pipeline/src/gsd-video-pipeline.test.ts`

Steps:
1. Keep backward-compatible exports if needed.
2. Generate 18 stages.
3. Generate artifact index.
4. Generate weighted score breakdown.
5. Write full package folders.

Verification:
- CLI smoke produces `contract/`, `research/`, `strategy/`, `script/`, `style/`, `storyboard/`, `routing/`, `assets/`, `audio/`, `subtitles/`, `clips/`, `edit/`, `render/`, `qa/`, `package/`, `learning/`.

---

## Phase 2 — Dashboard and API become a real cockpit

### Task 7: Add run lookup persistence

Objective: dashboard can fetch prior run state.

Files:
- Modify: `apps/orchestrator/src/server.ts`
- Add: `apps/orchestrator/src/video-run-store.ts`
- Test: server route test if existing pattern supports it.

Routes:
- `GET /video-pipeline/runs/:id`
- `GET /video-pipeline/runs/:id/artifacts`

Verification:
- create run, then fetch it by run ID.

### Task 8: Add retry/approval API contracts

Objective: operator can retry failed stages and approve paid fallback safely.

Files:
- Modify: `apps/orchestrator/src/server.ts`

Routes:
- `POST /video-pipeline/runs/:id/stages/:stageKey/retry`
- `POST /video-pipeline/runs/:id/approve-paid-fallback`

Verification:
- paid fallback cannot be enabled without explicit request.
- retry increments stage retry count.

### Task 9: Upgrade dashboard to 18-stage timeline

Objective: UI shows the real product pipeline, not only a score card.

Files:
- Modify: `apps/dashboard/index.html`

Steps:
1. Add 18-stage vertical timeline.
2. Add score breakdown panel.
3. Add gate failure panel.
4. Add artifacts panel.
5. Add cost panel.
6. Add regenerate/approve controls as disabled/stubbed until API support is complete.

Verification:
- browser/manual check shows all 18 stages and no hidden failures.

---

## Phase 3 — Runtime adapters, initially dry-run/health-check only

### Task 10: Add ComfyUI adapter interface

Objective: prepare image/video generation through local ComfyUI without hard dependency during tests.

Files:
- Create: `apps/orchestrator/src/adapters/comfyui.ts`

Functions:
- `checkComfyHealth()`
- `submitComfyWorkflow()`
- `monitorComfyPrompt()`
- `downloadComfyOutputs()`

Verification:
- if ComfyUI is down, adapter returns actionable diagnostic, not crash.

### Task 11: Add FFmpeg adapter

Objective: validate final media and sample frames.

Files:
- Create: `apps/orchestrator/src/adapters/ffmpeg.ts`

Functions:
- `ffprobeMedia()`
- `sampleFrames()`
- `normalizeAudio()`
- `renderThumbnail()`

Verification:
- missing ffmpeg/ffprobe returns clean blocker.

### Task 12: Add Remotion adapter interface

Objective: deterministic motion graphics and final timeline render.

Files:
- Create: `apps/orchestrator/src/adapters/remotion.ts`

Functions:
- `renderPreview()`
- `renderMaster()`

Verification:
- dry-run returns expected render command and paths.

### Task 13: Add audio/subtitle utilities

Objective: SRT/VTT generation and duration/readability checks.

Files:
- Create: `apps/orchestrator/src/adapters/audio.ts`
- Create: `apps/orchestrator/src/adapters/subtitles.ts`

Verification:
- test script creates valid SRT/VTT from a tiny timeline.

---

## Phase 4 — Quality automation

### Task 14: Add technical QA report generator

Objective: validate final video mechanically.

Files:
- Create: `packages/pipeline/src/video-pipeline/technical-qa.ts`

Checks:
- file exists
- duration tolerance
- fps/resolution
- audio stream present
- black/frozen frame basic detection slot
- subtitle presence/readability slot

Verification:
- intentionally missing final file fails.

### Task 15: Add creative QA schema

Objective: standardize LLM/Hermes review output.

Files:
- Create: `packages/pipeline/src/video-pipeline/creative-qa.ts`

Rubric:
- hook
- factual accuracy
- narrative coherence
- visual consistency
- cinematic quality
- pacing
- audio
- subtitles
- brand fit
- publish readiness

Verification:
- score below threshold blocks best-on-market release.

---

## Phase 5 — Production proof

### Task 16: Re-run full verification

Commands:
- `pnpm run build`
- `pnpm run test`
- CLI smoke with normal prompt.
- CLI smoke with weak prompt.

Expected:
- normal prompt creates 18-stage package.
- weak prompt loops/blocks with actionable diagnostics.

### Task 17: Paperclip proof update

Objective: keep source of truth aligned.

Actions:
- comment on `DAN-789` with build/test/CLI evidence.
- update `DAN-790` only when runtime/deploy is actually verified.
- keep production-ready claim blocked until final video generation + QA proof exists.

---

## Production deployment is intentionally last

Do not deploy the dashboard as “production ready” until:
- strict 18-stage engine exists.
- weighted scoring exists.
- no-secret gate exists.
- artifact contract exists.
- dashboard displays all stages/gates.
- runtime adapters return useful health diagnostics.
- build/tests pass.
- Paperclip proof is posted.
