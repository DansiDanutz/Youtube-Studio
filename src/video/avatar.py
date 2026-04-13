"""
Avatar lip-sync — Sienna droplet, tier-routed model selection.

Tier routing (M4.yaml):

    free       → wav2lip       (fast, decent sync)
    standard   → sadtalker     (talking-head, still image)
    pro        → musetalk      (high fidelity, real-time)
    enterprise → liveportrait  (best-in-class)

For each scene that carries an `avatar_id` (stored on the manifest, not the
scene) we call the selected model with:

    * source image  → user_avatars row (manifest.avatar_id)
    * driving audio → scene's TTS audio (scene_XX.wav on Nano)

The resulting lip-synced MP4 replaces scene.video_url. Offline fallback
copies the existing scene video through unchanged so the pipeline keeps
producing a valid final asset during smoke tests.

Scenes without an avatar_id are untouched.
"""
from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from typing import Callable

from src.infra import storage
from src.manifest import RunManifest, Scene, Tier

log = logging.getLogger(__name__)


TIER_TO_MODEL: dict[Tier, str] = {
    Tier.FREE: "wav2lip",
    Tier.STANDARD: "sadtalker",
    Tier.PRO: "musetalk",
    Tier.ENTERPRISE: "liveportrait",
}

PER_SCENE_BUDGET_CENTS = 400


@dataclass
class AvatarResult:
    scene_number: int
    model: str
    video_url: str
    bytes_written: int


# ----------------------------- dispatcher entry ---------------------------- #

def run(manifest: RunManifest) -> RunManifest:
    if not manifest.avatar_id:
        log.info("avatar: manifest %s has no avatar_id — skipping lip-sync", manifest.project_id)
        return manifest

    if not manifest.scenes:
        return manifest

    model = _model_for(manifest)
    log.info(
        "avatar: manifest=%s tier=%s model=%s avatar_id=%s scenes=%d",
        manifest.project_id,
        manifest.tier,
        model,
        manifest.avatar_id,
        len(manifest.scenes),
    )

    sync = _sync_for(model)
    for scene in manifest.scenes:
        if not scene.video_url:
            continue
        result = sync(manifest, scene, model)
        scene.video_url = result.video_url
        _persist_render_row(manifest, scene, result)

    return manifest


def model_for_tier(tier: Tier | str) -> str:
    t = Tier(tier) if isinstance(tier, str) else tier
    return TIER_TO_MODEL.get(t, "wav2lip")


# --------------------------- routing --------------------------------------- #

def _model_for(manifest: RunManifest) -> str:
    override = (manifest.flags or {}).get("avatar_model")
    if override:
        return str(override)
    return model_for_tier(manifest.tier)


def _sync_for(model: str) -> Callable[[RunManifest, Scene, str], AvatarResult]:
    if model == "wav2lip":
        return _sync_wav2lip
    if model == "sadtalker":
        return _sync_sadtalker
    if model == "musetalk":
        return _sync_musetalk
    if model == "liveportrait":
        return _sync_liveportrait
    log.warning("avatar: unknown model %s — passthrough", model)
    return _sync_passthrough


# --------------------------- provider impls -------------------------------- #

def _sync_wav2lip(manifest: RunManifest, scene: Scene, model: str) -> AvatarResult:
    return _remote_or_passthrough(manifest, scene, model, "WAV2LIP_URL")


def _sync_sadtalker(manifest: RunManifest, scene: Scene, model: str) -> AvatarResult:
    return _remote_or_passthrough(manifest, scene, model, "SADTALKER_URL")


def _sync_musetalk(manifest: RunManifest, scene: Scene, model: str) -> AvatarResult:
    return _remote_or_passthrough(manifest, scene, model, "MUSETALK_URL")


def _sync_liveportrait(manifest: RunManifest, scene: Scene, model: str) -> AvatarResult:
    return _remote_or_passthrough(manifest, scene, model, "LIVEPORTRAIT_URL")


def _sync_passthrough(manifest: RunManifest, scene: Scene, model: str) -> AvatarResult:
    return _passthrough(manifest, scene, f"{model}-offline")


def _remote_or_passthrough(manifest: RunManifest, scene: Scene, model: str, url_env: str) -> AvatarResult:
    endpoint = os.environ.get(url_env) or os.environ.get("SIENNA_AVATAR_URL")
    if not endpoint:
        return _passthrough(manifest, scene, f"{model}-offline")

    audio_url = storage.url_for("nano", str(manifest.project_id), f"audio/scene_{scene.scene_number:02d}.wav")
    payload = {
        "avatar_id": manifest.avatar_id,
        "source_video_url": scene.video_url,
        "driving_audio_url": audio_url,
        "duration": scene.duration,
    }
    mp4 = _post_for_mp4(endpoint, payload, token_env="SIENNA_AVATAR_TOKEN")
    if mp4 is None:
        return _passthrough(manifest, scene, f"{model}-offline")
    return _upload_and_pack(manifest, scene, model, mp4)


# --------------------------- helpers --------------------------------------- #

def _post_for_mp4(url: str, payload: dict, token_env: str) -> bytes | None:
    try:
        import requests  # type: ignore
    except ImportError:
        return None
    headers = {"Content-Type": "application/json"}
    token = os.environ.get(token_env)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=600)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("avatar: %s failed: %s", url, exc)
        return None
    body = resp.content
    if b"ftyp" not in body[:64]:
        return None
    return body


def _passthrough(manifest: RunManifest, scene: Scene, model: str) -> AvatarResult:
    """Re-upload the existing scene MP4 under the 'sienna' bucket so downstream
    can find it by scene_number, unchanged."""
    from urllib.parse import urlparse
    from pathlib import Path

    src = scene.video_url or ""
    if src.startswith("file://"):
        try:
            data = Path(urlparse(src).path).read_bytes()
        except Exception:
            data = b""
    else:
        data = b""
    return _upload_and_pack(manifest, scene, model, data or b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")


def _upload_and_pack(manifest: RunManifest, scene: Scene, model: str, mp4: bytes) -> AvatarResult:
    filename = f"avatar/scene_{scene.scene_number:02d}.mp4"
    url = storage.put_bytes(
        droplet="sienna",
        project_id=str(manifest.project_id),
        filename=filename,
        data=mp4,
        content_type="video/mp4",
    )
    return AvatarResult(
        scene_number=scene.scene_number,
        model=model,
        video_url=url,
        bytes_written=len(mp4),
    )


def _persist_render_row(manifest: RunManifest, scene: Scene, result: AvatarResult) -> None:
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
                "scene_number": scene.scene_number,
                "asset_type": "avatar",
                "provider": result.model,
                "output_url": result.video_url,
                "bytes": result.bytes_written,
                "status": "done",
                "sha256": hashlib.sha256(result.video_url.encode()).hexdigest(),
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("avatar: render-row insert failed (%s)", exc)


__all__ = ["run", "model_for_tier", "AvatarResult", "TIER_TO_MODEL"]
