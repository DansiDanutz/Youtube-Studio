# Professional Video Missing Integrations Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn the current professional-video blocker list into a concrete integration control layer that can safely decide when the Hermes/DansLab professional render may run.

**Architecture:** Keep provider/tool execution gated. Add deterministic TypeScript planning/readiness artifacts first, then wire smoke checks and artifact contracts. Full professional generation remains blocked until every blocker is verified, not merely configured.

**Tech Stack:** TypeScript, Node test runner, FFmpeg/ffprobe, local-first ComfyUI/Remotion hooks, Paperclip proof, no-secret sanitizer.

---

## Missing integration analysis

### Blocker 1: Premium Brian-like voice
- Current: credentials/package presence was observed, but no approved voice id and no strict TS connector.
- Need: approved voice configuration, operator/cost approval, 20-30s probe clip, ffprobe/loudness proof, cost ledger, no-secret proof.
- Implementation now: add readiness checkpoint and artifact contract so the system cannot mark voice ready without required proof files.
- Later live connector: ElevenLabs adapter or verified local premium voice fallback.

### Blocker 2: Cinematic visual generation
- Current: ComfyUI route is conceptually present but local API is not verified live.
- Need: ComfyUI health, model/workflow inventory, one generated smoke asset, visual provenance manifest.
- Implementation now: add readiness checkpoint and proof-file contract.
- Later live connector: ComfyUI workflow runner under local-first policy.

### Blocker 3: Motion/editing system
- Current: Remotion is not installed/wired in YouTube-Studio.
- Need: Remotion dependency/composition, smoke clip, timeline manifest, FFmpeg packaging proof.
- Implementation now: add readiness checkpoint and proof-file contract.
- Later live connector: Remotion composition plus FFmpeg final packaging.

### Blocker 4: Design-system import
- Current: open-design/Hyperframes/Xiaohongshu assets exist but are not materialized into strict video artifacts.
- Need: style-bible.json, shot-list.json, overlay-style.json, typography/motion grammar.
- Implementation now: add readiness checkpoint and proof-file contract.
- Later live connector: importer from open-design assets into run artifact directory.

### Blocker 5: Paid fallback governance
- Current: fal/Seedance-style routes are not wired and must remain disabled by default.
- Need: explicit per-run approval, provider connector health, real cost ledger, no anonymous public real execution.
- Implementation now: add explicit approval/cost gate in readiness plan.

## Implementation tasks

### Task 1: Add professional readiness contract tests
**Objective:** Define the desired readiness behavior before code.
**Files:**
- Create: `packages/pipeline/src/video-pipeline/professional-readiness.test.ts`

Steps:
1. Test that missing voice/visual/motion/design proof files block professional render.
2. Test that all required proof files mark the render queueable.
3. Test that paid fallback cannot be ready without explicit approval and cost ledger.
4. Test that system leverage plan includes Paperclip, OpenClaw/David, Memo reporting, QA gates, and learning capture.

### Task 2: Implement professional readiness module
**Objective:** Convert missing integrations into deterministic checks and artifacts.
**Files:**
- Create: `packages/pipeline/src/video-pipeline/professional-readiness.ts`
- Modify: `packages/pipeline/src/video-pipeline/index.ts`

Steps:
1. Export readiness checkpoint types.
2. Implement `createProfessionalReadinessPlan()`.
3. Implement `evaluateProfessionalReadiness()`.
4. Implement `writeProfessionalReadinessArtifacts()`.
5. Sanitize every artifact with `assertNoSecrets` / `sanitizeForManifest`.

### Task 3: Implement system leverage plan
**Objective:** Define what else is needed to leverage the whole Dan's Lab system after adapter wiring.
**Files:**
- Same module or separate helper in `professional-readiness.ts`.

Steps:
1. Add lanes: Paperclip source-of-truth, David/OpenClaw executor, Memo digest/reporting, ComfyUI/Remotion render farm, QA/review gate, skill/SOP capture, cost ledger, security/no-secret gate.
2. Add per-lane acceptance criteria and proof artifacts.
3. Expose as `createSystemLeveragePlan()`.

### Task 4: Add CLI access
**Objective:** Let operators generate readiness/leverage reports from the CLI.
**Files:**
- Modify: `apps/orchestrator/src/cli.ts`

Steps:
1. Add command `video-professional-readiness`.
2. Accept prompt/length/design flags.
3. Write manifest + readiness + leverage artifacts.
4. Print release decision and blocker count.

### Task 5: Verify and post proof
**Objective:** Prove the new gate works and does not trigger paid providers.
**Commands:**
- `pnpm run test`
- `pnpm run video-professional-readiness -- --prompt "Explain Hermes agent inside DansLab Company" --length 900`
- inspect generated JSON for no secrets and correct blocked decision.

## Final regeneration rule
Only queue/generate the professional Hermes/DansLab video if `evaluateProfessionalReadiness().queueDecision === "queueable"`. If blocked, do not generate another weak video; post exact missing proofs and next actions.
