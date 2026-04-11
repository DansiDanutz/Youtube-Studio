# 2026-04-11 Provider Smoke Runbook

## Objective

Clear the remaining Milestone 2 gate with one live OpenAI-backed smoke run and one manual review pass.

This runbook exists to keep the unblock step narrow:

- do not open voice or captions yet
- do not widen into asset generation or rendering
- do not debug hypothetical downstream stages before the script lane is live-verified

## Preconditions

The canonical repo should already pass:

- `pnpm run typecheck`
- `pnpm run test`

Required secret:

- `OPENAI_API_KEY`

Optional but currently out of scope:

- `ELEVENLABS_API_KEY`

## Command

Run the live smoke against the audited airplane fixture:

```bash
OPENAI_API_KEY=... pnpm run job:smoke -- --mode provider --fixture fixtures/topics/airplanes-one-engine-research-approved.json
```

If a model override is needed for debugging, use:

```bash
OPENAI_API_KEY=... pnpm run job:smoke -- --mode provider --openai-model gpt-5.4-mini --fixture fixtures/topics/airplanes-one-engine-research-approved.json
```

## Expected Success Output

The command should print:

- `Smoke run complete: run-...`
- `mode: provider`
- `model: ...`
- paths for `brief.json`, `script.json`, `script_draft.md`, `review/script.md`, and `review/index.html`

The run directory should contain:

- `artifacts/runs/<run-id>/brief.json`
- `artifacts/runs/<run-id>/script.json`
- `artifacts/runs/<run-id>/script_draft.md`
- `artifacts/runs/<run-id>/review/script.md`
- `artifacts/runs/<run-id>/review/index.html`
- `artifacts/runs/<run-id>/review/review-summary.json`

## Required Manual Review

Open `review/index.html` for the new run and answer these questions before opening Milestone 3:

1. Is the hook immediate and still grounded in the approved fact pack?
2. Do all five lines cite only real fact ids from the fixture?
3. Does any line overstate safety, certainty, or aviation guarantees beyond the evidence pack?
4. Is the payoff narrow enough to stay inside the approved source matrix?
5. Would this script be worth sending to narration without rewriting it first?

Treat any "no" answer as a Milestone 2 failure. Fix the script lane. Do not open voice work yet.

## Go / No-Go Rule

Go for the next voice-and-caption implementation issue only if all of the following are true:

- the provider smoke command exits successfully
- `review-summary.json` reports `mode=provider`
- `review-summary.json` reports `briefNormalization=openai`
- `review-summary.json` reports `scriptGeneration=openai`
- grounding status remains verified
- the manual review answers are all yes

Otherwise:

- keep work inside the script lane
- fix only provider prompt shape, schema handling, or grounding enforcement
- do not widen scope

## Fast Failure Triage

### `OPENAI_API_KEY is required for provider mode`

Meaning:

- the environment secret was not present in the active shell

Action:

- export `OPENAI_API_KEY`
- rerun the same command

### `PROVIDER_REQUEST_FAILED`

Meaning:

- the live API call failed before valid structured output returned

Action:

- inspect the provider error message
- confirm the key is valid and the model name is allowed
- retry once before changing prompts

### `PROVIDER_SCHEMA_INVALID`

Meaning:

- OpenAI returned content that the strict local schema could not accept

Action:

- inspect the raw provider response path in `packages/pipeline/src/openai.ts`
- tighten instructions or schema expectations
- keep the rest of the lane untouched

### `SCRIPT_FACT_COVERAGE_FAILED`

Meaning:

- the generated script cited an unknown, empty, or missing fact id

Action:

- treat this as a successful guardrail, not a downstream bug
- adjust only the provider prompt or fact-pack contract
- rerun the same fixture after the fix

## Evidence To Record

After a successful run, capture:

- run id
- model used
- command used
- pass or fail verdict from manual review
- exact follow-up decision: `open-voice-lane` or `fix-script-lane`

## Decision Owner

The next CEO-level decision is not architectural.

It is simply:

- provide `OPENAI_API_KEY` and run this once, or
- delegate that run to an operator with secret access

Everything else should stay frozen until that evidence exists.
