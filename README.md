# YuteStudio — AI YouTube Automation Platform

Full spec lives in `docs/SPEC.md`. This README is the implementation entry point.

## Architecture in one paragraph

YuteStudio is a Paperclip-orchestrated pipeline: **GSD** reads `config/milestones/M{N}.yaml`, writes tasks into Supabase `yute_tasks`, and dispatches them to the agent fleet (Claude Code, Autoresearch, Discovery, Dexter, Nano, Memo, Sienna, Growth, Stripe, N8N, Hermes, Doctor, KimiClaw, Obsidian, Vercel, Supabase, GitHub). Every task is budget-capped, schema-validated on output, and retried twice before parking. Runs are JSON manifests in `yute_runs` — every agent is a pure function over the manifest, so the pipeline is resumable and parallelizable by construction.

## Quick start

```bash
# 1. Install deps
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Fill secrets
cp .env.example .env   # then edit

# 3. Apply DB migration
supabase db push --file supabase/migrations/0001_yute_delta.sql

# 4. Seed milestones
python -m src.orchestrator.seed_milestones

# 5. Start the roadmap loop (dry run first)
python -m src.orchestrator.roadmap --dry-run
python -m src.orchestrator.roadmap

# 6. Serve the API
uvicorn src.api.main:app --reload
```

## Layout

```text
repo/
├── config/milestones/M{1..6}.yaml   # Declarative milestones — edit these, not the DB
├── src/
│   ├── orchestrator/                # GSD's brain: roadmap loop, dispatcher, budget guard, approvals, doctor
│   ├── manifest/                    # Pydantic manifest schema
│   ├── prompt_engine/               # M1.2 — idea → enhanced prompt
│   ├── research/                    # M1.3–4 — SerpAPI + Playwright + ranker
│   ├── script/                      # M1.5 — scene-by-scene generator
│   └── api/                         # M1.6 — FastAPI entry point
├── supabase/migrations/             # DDL, idempotent
├── scripts/                         # Ops scripts (e.g. register scheduled tasks)
└── tests/                           # Smoke + unit
```

## Deployment readiness

See `docs/DEPLOYMENT_READINESS.md` for the real-world blockers that still sit outside local smoke coverage:

- GitHub push + CI
- Telegram approval delivery
- model endpoint wiring (`KOKORO_TTS_URL`, `FLUX_SCHNELL_URL`, etc.)
- FastAPI deployment
- YouTube OAuth for M5

## What the 5 human gates look like in practice

See `docs/ROADMAP.md` — ported from `../09-Autonomous-Roadmap.md`. Dan's total involvement is < 6 hours across 26 weeks.
