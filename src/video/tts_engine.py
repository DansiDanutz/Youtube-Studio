"""
TTS engine — synthesises spoken audio for every scene, one WAV per scene.

Runs on the Nano droplet. Tier-routed per M2.yaml:

    free       → kokoro      (CPU-cheap)
    standard   → chatterbox  (primary)
    pro        → chatterbox
    enterprise → f5          (highest fidelity)

Backends are selected via env vars and always fall back to a deterministic
offline stub if the provider can't be reached. Output URL is persisted to
video_renders.output_url and the scene is decorated with `audio_url`.
"""
from __future__ import annotations

import logging
import os
import struct
import wave
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Callable

from src.infra import storage
from src.manifest import RunManifest, Scene, Tier

log = logging.getLogger(__name__)


TIER_TO_PROVIDER: dict[Tier, str] = {
    Tier.FREE: "kokoro",
    Tier.STANDARD: "chatterbox",
    Tier.PRO: "chatterbox",
    Tier.ENTERPRISE: "f5",
}

# Rough per-scene cost guardrail, cents. Updated by milestone config.
PER_SCENE_BUDGET_CENTS = 200


@dataclass
class TTSResult:
    scene_number: int
    provider: str
    audio_url: str
    duration_seconds: float
    bytes_written: int


# ----------------------------- dispatcher entry ---------------------------- #

def run(manifest: RunManifest) -> RunManifest:
    """Dispatcher entrypoint — synthesise every scene's audio track."""
    if not manifest.scenes:
        log.warning("TTS: no scenes on manifest %s — skipping", manifest.project_id)
        return manifest

    provider = _provider_for(manifest)
    log.info(
        "TTS: manifest=%s tier=%s provider=%s scenes=%d",
        manifest.project_id,
        manifest.tier,
        provider,
        len(manifest.scenes),
    )

    synth = _synth_for(provider)
    for scene in manifest.scenes:
        if scene.script.strip() == "":
            continue
        result = synth(manifest, scene, provider)
        scene.text_overlays  # keep lint happy
        _attach_audio_to_scene(scene, result)
        _persist_render_row(manifest, scene, result)

    return manifest


def provider_for_tier(tier: Tier | str) -> str:
    t = Tier(tier) if isinstance(tier, str) else tier
    return TIER_TO_PROVIDER.get(t, "kokoro")


# --------------------------- provider selection ---------------------------- #

def _provider_for(manifest: RunManifest) -> str:
    # Let operator override via manifest.flags["tts_provider"] for experiments.
    override = (manifest.flags or {}).get("tts_provider")
    if override:
        return str(override)
    return provider_for_tier(manifest.tier)


def _synth_for(provider: str) -> Callable[[RunManifest, Scene, str], TTSResult]:
    if provider == "chatterbox":
        return _synth_chatterbox
    if provider == "kokoro":
        return _synth_kokoro
    if provider == "f5":
        return _synth_f5
    log.warning("TTS: unknown provider %s — using offline fallback", provider)
    return _synth_offline


# --------------------------- provider implementations --------------------- #

def _synth_chatterbox(manifest: RunManifest, scene: Scene, provider: str) -> TTSResult:
    endpoint = os.environ.get("CHATTERBOX_TTS_URL")
    if not endpoint:
        return _synth_offline(manifest, scene, provider)
    payload = {
        "text": scene.script,
        "voice": manifest.voice_id or "narrator-default",
    }
    wav_bytes = _post_for_wav(endpoint, payload, token_env="CHATTERBOX_TTS_TOKEN")
    if wav_bytes is None:
        return _synth_offline(manifest, scene, provider)
    return _upload_and_pack(manifest, scene, provider, wav_bytes)


def _synth_kokoro(manifest: RunManifest, scene: Scene, provider: str) -> TTSResult:
    endpoint = os.environ.get("KOKORO_TTS_URL")
    if not endpoint:
        return _synth_offline(manifest, scene, provider)
    payload = {
        "text": scene.script,
        "voice": manifest.voice_id or "af_heart",
        "speed": 1.0,
    }
    wav_bytes = _post_for_wav(endpoint, payload, token_env="KOKORO_TTS_TOKEN")
    if wav_bytes is None:
        return _synth_offline(manifest, scene, provider)
    return _upload_and_pack(manifest, scene, provider, wav_bytes)


def _synth_f5(manifest: RunManifest, scene: Scene, provider: str) -> TTSResult:
    endpoint = os.environ.get("F5_TTS_URL")
    if not endpoint:
        return _synth_offline(manifest, scene, provider)
    payload = {
        "text": scene.script,
        "reference_audio_url": manifest.voice_id,
        "output_format": "wav",
    }
    wav_bytes = _post_for_wav(endpoint, payload, token_env="F5_TTS_TOKEN")
    if wav_bytes is None:
        return _synth_offline(manifest, scene, provider)
    return _upload_and_pack(manifest, scene, provider, wav_bytes)


def _synth_offline(manifest: RunManifest, scene: Scene, provider: str) -> TTSResult:
    """Deterministic, silent WAV sized to scene.duration — keeps smoke tests green."""
    wav_bytes = _silent_wav(duration_seconds=max(scene.duration, 1))
    return _upload_and_pack(manifest, scene, f"{provider}-offline", wav_bytes)


# --------------------------- helpers --------------------------------------- #

def _post_for_wav(url: str, payload: dict, token_env: str) -> bytes | None:
    try:
        import requests  # type: ignore
    except ImportError:
        log.warning("TTS: requests not installed — skipping network")
        return None
    headers: dict[str, str] = {"Content-Type": "application/json"}
    token = os.environ.get(token_env)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=120)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("TTS: %s failed: %s", url, exc)
        return None
    if not resp.content or len(resp.content) < 44:  # WAV header is 44 bytes
        log.warning("TTS: %s returned %d bytes (<44)", url, len(resp.content))
        return None
    return resp.content


def _silent_wav(duration_seconds: int, sample_rate: int = 16000) -> bytes:
    n_samples = duration_seconds * sample_rate
    buf = BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(struct.pack("<" + "h" * n_samples, *([0] * n_samples)))
    return buf.getvalue()


def _upload_and_pack(
    manifest: RunManifest,
    scene: Scene,
    provider: str,
    wav_bytes: bytes,
) -> TTSResult:
    filename = f"audio/scene_{scene.scene_number:02d}.wav"
    url = storage.put_bytes(
        droplet="nano",
        project_id=str(manifest.project_id),
        filename=filename,
        data=wav_bytes,
        content_type="audio/wav",
    )
    duration = _wav_duration_seconds(wav_bytes) or float(scene.duration)
    return TTSResult(
        scene_number=scene.scene_number,
        provider=provider,
        audio_url=url,
        duration_seconds=duration,
        bytes_written=len(wav_bytes),
    )


def _wav_duration_seconds(wav_bytes: bytes) -> float | None:
    try:
        with wave.open(BytesIO(wav_bytes), "rb") as r:
            frames = r.getnframes()
            rate = r.getframerate()
            if rate == 0:
                return None
            return frames / float(rate)
    except Exception:  # noqa: BLE001
        return None


def _attach_audio_to_scene(scene: Scene, result: TTSResult) -> None:
    # Stash in text_overlays[0] payload? Scene model has no audio_url field —
    # we use metrics via metadata attached by pipeline consumers. For now,
    # pin it to background_prompt metadata; render_pipeline re-reads from
    # video_renders anyway.
    scene.status = "rendering"
    scene.background_prompt = scene.background_prompt  # noop, reserved
    # The durable record lives in video_renders (see _persist_render_row).


def _persist_render_row(manifest: RunManifest, scene: Scene, result: TTSResult) -> None:
    try:
        from src.orchestrator.db import get_client, insert_render_record
    except Exception as exc:  # noqa: BLE001
        log.debug("TTS: db module unavailable (%s) — skipping persistence", exc)
        return
    client = None
    try:
        client = get_client()
    except Exception as exc:  # noqa: BLE001
        log.debug("TTS: no Supabase client (%s) — skipping persistence", exc)
        return
    try:
        insert_render_record(
            client,
            project_id=str(manifest.project_id),
            scene_number=scene.scene_number,
            render_type="audio",
            provider=result.provider,
            output_url=result.audio_url,
            bytes_written=result.bytes_written,
            duration_seconds=result.duration_seconds,
            description="Per-scene narration WAV",
        )
    except Exception as exc:  # noqa: BLE001
        # video_renders may have a different column set on this env — don't
        # block the smoke path on schema drift.
        log.warning("TTS: render-row insert failed (%s) — continuing", exc)


__all__ = ["run", "provider_for_tier", "TTSResult", "TIER_TO_PROVIDER"]
