"""
Background music generation — AudioCraft / MusicGen on Dexter.

Produces a single BGM WAV covering the full video duration. The prompt is
derived from the manifest's title + enhanced prompt (mood hints). The
resulting file is stored on the Dexter bucket and recorded on
`manifest.metadata["bgm_url"]`.

Offline fallback: a deterministic silent WAV sized to total duration.
"""
from __future__ import annotations

import hashlib
import logging
import os
import struct
import wave
from dataclasses import dataclass
from io import BytesIO

from src.infra import storage
from src.manifest import RunManifest

log = logging.getLogger(__name__)

PER_RUN_BUDGET_CENTS = 200


@dataclass
class BGMResult:
    url: str
    bytes_written: int
    duration_seconds: int
    model: str


def run(manifest: RunManifest) -> RunManifest:
    duration = sum(max(s.duration, 1) for s in manifest.scenes) or 1
    prompt = _derive_prompt(manifest)

    endpoint = os.environ.get("MUSICGEN_URL") or os.environ.get("AUDIOCRAFT_URL")
    wav_bytes = None
    model = "musicgen"
    if endpoint:
        wav_bytes = _post_for_wav(endpoint, {"prompt": prompt, "duration": duration}, "AUDIOCRAFT_TOKEN")
    if wav_bytes is None:
        wav_bytes = _silent_wav(duration)
        model = "musicgen-offline"

    url = storage.put_bytes(
        droplet="dexter",
        project_id=str(manifest.project_id),
        filename="audio/bgm.wav",
        data=wav_bytes,
        content_type="audio/wav",
    )
    manifest.metadata = {**(manifest.metadata or {}), "bgm_url": url, "bgm_prompt": prompt}
    log.info(
        "bgm: manifest=%s model=%s duration=%ss url=%s bytes=%d",
        manifest.project_id, model, duration, url, len(wav_bytes),
    )
    _persist_render_row(manifest, BGMResult(url=url, bytes_written=len(wav_bytes), duration_seconds=duration, model=model))
    return manifest


# --------------------------- helpers --------------------------------------- #

def _derive_prompt(manifest: RunManifest) -> str:
    base = manifest.title or manifest.enhanced_prompt or manifest.original_prompt or "cinematic ambient score"
    base = base[:200].strip()
    return f"upbeat cinematic background music matching: {base}"


def _post_for_wav(url: str, payload: dict, token_env: str) -> bytes | None:
    try:
        import requests  # type: ignore
    except ImportError:
        return None
    headers = {"Content-Type": "application/json"}
    token = os.environ.get(token_env)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=300)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("bgm: %s failed: %s", url, exc)
        return None
    if len(resp.content) < 44:
        return None
    return resp.content


def _silent_wav(duration_seconds: int, sample_rate: int = 22050) -> bytes:
    n_samples = duration_seconds * sample_rate
    buf = BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(struct.pack("<" + "h" * n_samples, *([0] * n_samples)))
    return buf.getvalue()


def _persist_render_row(manifest: RunManifest, result: BGMResult) -> None:
    try:
        from src.orchestrator.db import T_RENDERS, get_client
    except Exception:
        return
    try:
        client = get_client()
    except Exception:
        return
    try:
        client.table(T_RENDERS).insert(
            {
                "project_id": str(manifest.project_id),
                "scene_number": 0,
                "asset_type": "bgm",
                "provider": result.model,
                "output_url": result.url,
                "bytes": result.bytes_written,
                "duration_seconds": float(result.duration_seconds),
                "status": "done",
                "sha256": hashlib.sha256(result.url.encode()).hexdigest(),
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("bgm: render-row insert failed (%s)", exc)


__all__ = ["run", "BGMResult"]
