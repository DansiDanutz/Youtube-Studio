# Dan's Lab 10-step video pipeline dashboard

This dashboard is a Vercel-ready control surface for the Hermes/OpenClaw local-first video pipeline.

## Runtime shape

- Vercel serves `apps/dashboard/index.html`.
- Vercel API route `api/video-pipeline.js` proxies job creation to the local/public orchestrator URL in `ORCHESTRATOR_API_URL`.
- The orchestrator endpoint is `POST /video-pipeline/runs` and writes artifacts under `videos/{prompt-slug}-{YYYYMMDD-HHMMSS}/`.

## Required env vars

Only names are documented here. Never paste raw values in commits, logs, Paperclip comments, or chat.

- `ORCHESTRATOR_API_URL`: HTTPS/base URL that reaches the Hermes/OpenClaw orchestrator.
- `ELEVENLABS_API_KEY`: optional, only when Step 4 uses ElevenLabs Brian voice.
- `FAL_KEY`: optional, only when the operator explicitly enables fal.ai fallback.
- `PERPLEXITY_API_KEY`: optional for Step 1 research lane if MCP is not already configured locally.

## Local verification

```bash
pnpm run build
node dist/apps/orchestrator/src/cli.js video-pipeline --prompt "What is the best weekly open source framework on GitHub" --length 60 --language en
node dist/apps/orchestrator/src/cli.js server --host 127.0.0.1 --port 3001
curl -sS http://127.0.0.1:3001/health
```

## Deploy

```bash
vercel deploy --prod
vercel env add ORCHESTRATOR_API_URL production
```

Do not deploy with real generation providers enabled until the orchestrator URL is protected and the no-secret gate passes.
