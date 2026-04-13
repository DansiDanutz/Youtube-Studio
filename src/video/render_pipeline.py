"""
Render pipeline — dispatcher entrypoint for PipelineState.RENDER.

Sequences per-scene asset generation across the three render droplets:

    1. Nano   → TTS        (audio/scene_XX.wav)
    2. Dexter → FLUX image (image/scene_XX.png)
    3. Memo   → video gen  (video/scene_XX.mp4)   -- enabled in M3

The Memo stage is gated on `manifest.flags["skip_video_gen"]` and on whether
there's enough budget left for the per-scene video cost. If either check
fails we return with audio+image populated (M2 behaviour) so the REVIEW gate
can still be opened with partial assets.

Budget guard: debits tts + image_gen + (optional) video_gen per-scene costs
against the manifest. If the remaining budget is insufficient even for the
M2 floor, the manifest is flipped to FAILED.
"""
from __future__ import annotations

import logging

from src.manifest import PipelineState, RunManifest
from src.video import avatar, image_gen, tts_engine, video_gen

log = logging.getLogger(__name__)


def run(manifest: RunManifest) -> RunManifest:
    n = len(manifest.scenes)
    if n == 0:
        log.warning("render_pipeline: manifest %s has no scenes — nothing to render", manifest.project_id)
        return manifest

    floor = (tts_engine.PER_SCENE_BUDGET_CENTS + image_gen.PER_SCENE_BUDGET_CENTS) * n
    remaining = manifest.remaining_budget_cents()
    if floor > remaining:
        log.error(
            "render_pipeline: budget short — need %dc (M2 floor), have %dc (manifest %s)",
            floor,
            remaining,
            manifest.project_id,
        )
        manifest.pipeline_state = PipelineState.FAILED
        manifest.flags = {**manifest.flags, "render_blocked": "insufficient_budget"}
        return manifest

    want_video = not bool((manifest.flags or {}).get("skip_video_gen"))
    want_avatar = bool(manifest.avatar_id) and not bool((manifest.flags or {}).get("skip_avatar"))

    video_cost = video_gen.PER_SCENE_BUDGET_CENTS * n if want_video else 0
    avatar_cost = avatar.PER_SCENE_BUDGET_CENTS * n if want_avatar else 0
    can_afford_video = want_video and (floor + video_cost) <= remaining
    can_afford_avatar = can_afford_video and want_avatar and (floor + video_cost + avatar_cost) <= remaining

    estimated = floor + (video_cost if can_afford_video else 0) + (avatar_cost if can_afford_avatar else 0)

    log.info(
        "render_pipeline: rendering %d scenes for %s (budget %dc / remaining %dc / video=%s avatar=%s)",
        n,
        manifest.project_id,
        estimated,
        remaining,
        "on" if can_afford_video else "off",
        "on" if can_afford_avatar else ("skip" if want_avatar else "none"),
    )

    manifest = tts_engine.run(manifest)
    manifest = image_gen.run(manifest)
    if can_afford_video:
        manifest = video_gen.run(manifest)
    elif want_video:
        log.warning(
            "render_pipeline: skipping video_gen for %s — need %dc more",
            manifest.project_id,
            video_cost,
        )
    if can_afford_avatar:
        manifest = avatar.run(manifest)
    elif want_avatar:
        log.warning(
            "render_pipeline: skipping avatar for %s — need %dc more",
            manifest.project_id,
            avatar_cost,
        )

    for scene in manifest.scenes:
        if scene.background_image_url:
            scene.status = "done"

    manifest.spent_cents += estimated
    return manifest


__all__ = ["run"]
