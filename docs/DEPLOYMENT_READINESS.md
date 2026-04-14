# Deployment Readiness

This repo can advance milestone gates with local smoke coverage, but a real
end-to-end run still depends on five external surfaces being wired.

## Already green

- MoltBot control-plane schema seeded (`yute_milestones`, `yute_approvals`, `yute_run_meta`)
- M1-M4 smoke tests passing locally
- FastAPI app present at `src.api.main:app`
- GitHub Actions workflow present at `.github/workflows/ci.yml`

## Required for real-world execution

### 1. GitHub push + CI

The repo push helper is ready:

```bash
bash scripts/push_to_github.sh
```

`gh` auth is required so the bootstrap branch and CI workflow can run on GitHub.

### 2. Telegram approvals

`src.orchestrator.approval_bridge` accepts either of these env vars:

- `TELEGRAM_CHAT_ID`
- `TELEGRAM_DAN_CHAT_ID` (backward-compatible alias)

Both still require:

- `TELEGRAM_BOT_TOKEN`
- a reachable FastAPI deployment for `/telegram/webhook`

Alternative while no public webhook exists:

- run `python -m scripts.telegram_poll_approvals --once`
- or keep `python -m scripts.telegram_poll_approvals --interval 5` running as a local poller

### 3. Real render endpoints

Without these endpoint envs, the render path stays on deterministic offline stubs:

- Nano TTS:
  - `KOKORO_TTS_URL`
  - `CHATTERBOX_TTS_URL`
  - `F5_TTS_URL`
- Dexter image generation:
  - `FLUX_SCHNELL_URL`
  - `FLUX_2_URL`
  - `DEXTER_FLUX_URL`

Optional auth:

- `KOKORO_TTS_TOKEN`
- `CHATTERBOX_TTS_TOKEN`
- `F5_TTS_TOKEN`
- `DEXTER_FLUX_TOKEN`

For temporary endpoint wiring without real model servers, the repo includes:

```bash
python scripts/model_stub_server.py tts --port 18011
python scripts/model_stub_server.py image --port 18012
python scripts/model_stub_server.py video --port 18013
```

Those stubs return deterministic WAV / PNG / MP4 responses and are useful for
network-path verification before real providers are attached.

### 4. FastAPI deployment

Local dev:

```bash
uvicorn src.api.main:app --reload
```

Production requires a reachable public base URL so `/telegram/webhook` can be
called by Telegram and any external approval bridge.

### 5. YouTube publish credentials (M5)

Publishing remains blocked until these are set:

- `YT_CLIENT_ID`
- `YT_CLIENT_SECRET`
- `YT_REFRESH_TOKEN`

## Practical order

1. Push repo and get CI green
2. Approve G1
3. Expose Kokoro + FLUX endpoints
4. Deploy FastAPI
5. Wire Telegram webhook
6. Add YouTube OAuth for M5
