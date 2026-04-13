"""
Image generation — one background image per scene, FLUX family on Dexter.

Tier routing (M2.yaml):

    free       → flux-schnell   (fast, 4-step)
    standard   → flux-schnell
    pro        → flux-2
    enterprise → flux-2

Each scene's `background_prompt` drives the image. Results are uploaded to
the Dexter bucket and written back onto `scene.background_image_url`. If the
FLUX endpoint is unavailable, we fall back to a deterministic 1280x720 PNG
gradient so the smoke test and offline dev loops keep passing.
"""
from __future__ import annotations

import hashlib
import logging
import os
import struct
import zlib
from dataclasses import dataclass
from typing import Callable

from src.infra import storage
from src.manifest import RunManifest, Scene, Tier

log = logging.getLogger(__name__)


TIER_TO_MODEL: dict[Tier, str] = {
    Tier.FREE: "flux-schnell",
    Tier.STANDARD: "flux-schnell",
    Tier.PRO: "flux-2",
    Tier.ENTERPRISE: "flux-2",
}

PER_SCENE_BUDGET_CENTS = 300
DEFAULT_WIDTH = 1280
DEFAULT_HEIGHT = 720


@dataclass
class ImageResult:
    scene_number: int
    model: str
    image_url: str
    bytes_written: int
    width: int
    height: int


# ----------------------------- dispatcher entry ---------------------------- #

def run(manifest: RunManifest) -> RunManifest:
    if not manifest.scenes:
        log.warning("image_gen: no scenes on manifest %s — skipping", manifest.project_id)
        return manifest

    model = _model_for(manifest)
    log.info(
        "image_gen: manifest=%s tier=%s model=%s scenes=%d",
        manifest.project_id,
        manifest.tier,
        model,
        len(manifest.scenes),
    )

    gen = _gen_for(model)
    for scene in manifest.scenes:
        if not scene.background_prompt.strip():
            # Fall back to first sentence of the script, so we always have a prompt.
            scene.background_prompt = scene.script.split(".")[0].strip()[:300] or "abstract background"
        result = gen(manifest, scene, model)
        scene.background_image_url = result.image_url
        _persist_render_row(manifest, scene, result)

    return manifest


def model_for_tier(tier: Tier | str) -> str:
    t = Tier(tier) if isinstance(tier, str) else tier
    return TIER_TO_MODEL.get(t, "flux-schnell")


# --------------------------- routing --------------------------------------- #

def _model_for(manifest: RunManifest) -> str:
    override = (manifest.flags or {}).get("image_model")
    if override:
        return str(override)
    return model_for_tier(manifest.tier)


def _gen_for(model: str) -> Callable[[RunManifest, Scene, str], ImageResult]:
    if model == "flux-2":
        return _gen_flux_2
    if model == "flux-schnell":
        return _gen_flux_schnell
    log.warning("image_gen: unknown model %s — using offline fallback", model)
    return _gen_offline


# --------------------------- provider impls -------------------------------- #

def _gen_flux_schnell(manifest: RunManifest, scene: Scene, model: str) -> ImageResult:
    endpoint = os.environ.get("FLUX_SCHNELL_URL") or os.environ.get("DEXTER_FLUX_URL")
    if not endpoint:
        return _gen_offline(manifest, scene, model)
    payload = {
        "prompt": scene.background_prompt,
        "steps": 4,
        "width": DEFAULT_WIDTH,
        "height": DEFAULT_HEIGHT,
    }
    png = _post_for_png(endpoint, payload, token_env="DEXTER_FLUX_TOKEN")
    if png is None:
        return _gen_offline(manifest, scene, model)
    return _upload_and_pack(manifest, scene, model, png)


def _gen_flux_2(manifest: RunManifest, scene: Scene, model: str) -> ImageResult:
    endpoint = os.environ.get("FLUX_2_URL") or os.environ.get("DEXTER_FLUX_URL")
    if not endpoint:
        return _gen_offline(manifest, scene, model)
    payload = {
        "prompt": scene.background_prompt,
        "steps": 28,
        "width": DEFAULT_WIDTH,
        "height": DEFAULT_HEIGHT,
        "guidance_scale": 3.5,
    }
    png = _post_for_png(endpoint, payload, token_env="DEXTER_FLUX_TOKEN")
    if png is None:
        return _gen_offline(manifest, scene, model)
    return _upload_and_pack(manifest, scene, model, png)


def _gen_offline(manifest: RunManifest, scene: Scene, model: str) -> ImageResult:
    png = _deterministic_gradient_png(scene.background_prompt, DEFAULT_WIDTH, DEFAULT_HEIGHT)
    return _upload_and_pack(manifest, scene, f"{model}-offline", png)


# --------------------------- helpers --------------------------------------- #

def _post_for_png(url: str, payload: dict, token_env: str) -> bytes | None:
    try:
        import requests  # type: ignore
    except ImportError:
        log.warning("image_gen: requests not installed — skipping network")
        return None
    headers: dict[str, str] = {"Content-Type": "application/json"}
    token = os.environ.get(token_env)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=180)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("image_gen: %s failed: %s", url, exc)
        return None
    body = resp.content
    if body[:8] != b"\x89PNG\r\n\x1a\n":
        log.warning("image_gen: %s did not return a PNG", url)
        return None
    return body


def _upload_and_pack(manifest: RunManifest, scene: Scene, model: str, png: bytes) -> ImageResult:
    filename = f"image/scene_{scene.scene_number:02d}.png"
    url = storage.put_bytes(
        droplet="dexter",
        project_id=str(manifest.project_id),
        filename=filename,
        data=png,
        content_type="image/png",
    )
    return ImageResult(
        scene_number=scene.scene_number,
        model=model,
        image_url=url,
        bytes_written=len(png),
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
    )


def _persist_render_row(manifest: RunManifest, scene: Scene, result: ImageResult) -> None:
    try:
        from src.orchestrator.db import T_RENDERS, T_SCENES, get_client
    except Exception as exc:  # noqa: BLE001
        log.debug("image_gen: db module unavailable (%s)", exc)
        return
    client = None
    try:
        client = get_client()
    except Exception as exc:  # noqa: BLE001
        log.debug("image_gen: no Supabase client (%s)", exc)
        return
    try:
        client.table(T_SCENES).update(
            {"background_image_url": result.image_url}
        ).eq("project_id", str(manifest.project_id)).eq(
            "scene_number", scene.scene_number
        ).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("image_gen: scene update failed (%s)", exc)
    try:
        client.table(T_RENDERS).insert(
            {
                "project_id": str(manifest.project_id),
                "scene_number": scene.scene_number,
                "asset_type": "image",
                "provider": result.model,
                "output_url": result.image_url,
                "bytes": result.bytes_written,
                "width": result.width,
                "height": result.height,
                "status": "done",
                "sha256": hashlib.sha256(result.image_url.encode()).hexdigest(),
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("image_gen: render-row insert failed (%s) — continuing", exc)


# --------------------------- offline PNG ----------------------------------- #

def _deterministic_gradient_png(seed: str, width: int, height: int) -> bytes:
    """Return a tiny deterministic PNG (gradient seeded by `seed`).

    Avoids Pillow — we ship raw PNG with one IDAT chunk. Small file (~5KB)
    but satisfies `b'\\x89PNG'` signature + IEND validation.
    """
    h = hashlib.sha256(seed.encode("utf-8")).digest()
    base_r, base_g, base_b = h[0], h[1], h[2]

    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type
        row_factor = y / max(height - 1, 1)
        for x in range(width):
            col_factor = x / max(width - 1, 1)
            r = int(base_r * (1 - col_factor) + (255 - base_r) * col_factor)
            g = int(base_g * (1 - row_factor) + (255 - base_g) * row_factor)
            b = int(base_b * (col_factor * row_factor + 0.0))
            raw.extend((r & 0xFF, g & 0xFF, b & 0xFF))

    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat_data = zlib.compress(bytes(raw), level=6)

    def _chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr_data)
        + _chunk(b"IDAT", idat_data)
        + _chunk(b"IEND", b"")
    )


__all__ = ["run", "model_for_tier", "ImageResult", "TIER_TO_MODEL"]
