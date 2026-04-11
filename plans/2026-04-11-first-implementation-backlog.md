# 2026-04-11 First Implementation Backlog

## Objective

Turn the approved bootstrap spec into the first bounded execution backlog for the canonical implementation repo.

This backlog keeps the product on one narrow path:

- one faceless educational Shorts format
- one control-plane runtime
- one staged pipeline with immutable artifacts
- one reviewable step at a time

## Concrete Stack

Use the lightest stack that already matches the verified scaffold:

- runtime: Node 22 + TypeScript
- package manager: pnpm workspace
- operator surface: CLI-first review flow with static review packages
- run ledger: SQLite via `node:sqlite`
- script provider: OpenAI Responses API
- narration provider: ElevenLabs Flash when the voice lane opens
- caption timing: OpenAI transcription on final narration audio
- render path: local `ffmpeg` once the render lane opens

## Repo Shape

The current repo structure is the intended starting point:

- `apps/orchestrator/`: CLI control plane and review actions
- `packages/domain/`: shared run, artifact, review, and failure contracts
- `packages/pipeline/`: brief, script, provider, review, and stage IO logic
- `packages/telemetry/`: run ledger
- `fixtures/`: deterministic smoke fixtures
- `operations/`: operator runbooks
- `docs/`: approved specification and architecture inputs

## First Bounded Backlog

### 1. Script lane live validation

Goal:

- prove the provider-backed script lane works in the canonical repo, not just in deterministic mode

Deliverables:

- one successful provider smoke run against `fixtures/topics/airplanes-one-engine-research-approved.json`
- recorded run id and manual review verdict
- any fixes kept strictly inside provider prompt shape, schema handling, or grounding enforcement

Exit criteria:

- `pnpm run env:check`, `pnpm run typecheck`, `pnpm run test`, and provider-mode `pnpm run job:smoke` all pass
- the generated review package stays grounded enough to open narration work

Blocking input:

- `OPENAI_API_KEY`

### 2. Voice and caption lane

Goal:

- turn an approved script into reviewable narration and audio-aligned captions

Deliverables:

- narration artifact contract
- caption artifact contract
- ElevenLabs-backed voice stage
- OpenAI-backed caption timing stage
- review package upgrades for audio and captions

Exit criteria:

- an approved script yields narration plus captions without manual editing
- voice and caption reruns do not regenerate upstream brief or script artifacts

Blocking input:

- successful script-lane live validation
- `ELEVENLABS_API_KEY`

### 3. Shot plan and asset lane

Goal:

- map narration beats to deterministic visual work units

Deliverables:

- shot plan stage
- per-shot asset prompts
- asset manifest and retry isolation

Exit criteria:

- each narration beat maps to one visual beat
- failed visual shots rerun independently

### 4. Render and publish package lane

Goal:

- render a reviewable 9:16 Short from cached upstream artifacts

Deliverables:

- `ffmpeg`-backed assembly template
- final review package with mp4, captions, thumbnail candidate, and metadata draft

Exit criteria:

- one reviewer can approve or reject the final package in under 5 minutes

### 5. Hardening and telemetry

Goal:

- make the lane operationally safe after the first end-to-end path works

Deliverables:

- failure taxonomy completion
- per-stage latency and cost summaries
- retry rules and operator-facing diagnostics

Exit criteria:

- failures are debuggable without reopening finished stages

## Sequencing Rule

Do not open work from a downstream lane until the current lane has real evidence, not just mocked coverage.

That means:

1. clear live script validation
2. open voice and captions
3. then open visuals
4. then render and packaging
5. then hardening

## Immediate Next Step

Run the live provider smoke in this repo as soon as `OPENAI_API_KEY` is available, using [operations/2026-04-11-provider-smoke-runbook.md](../operations/2026-04-11-provider-smoke-runbook.md).
