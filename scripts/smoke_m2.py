#!/usr/bin/env python3
"""
M2 smoke — offline end-to-end for the RENDER stage.

Builds a 2-scene manifest in-memory, invokes the render pipeline, and asserts
that each scene picks up a WAV (Nano) and a PNG (Dexter) in local storage.
Zero network — uses the deterministic TTS/FLUX fallbacks.

Run:  python -m scripts.smoke_m2
"""
from __future__ import annotations

import logging
import sys
import tempfile
from urllib.parse import urlparse
from pathlib import Path

from src.manifest import PipelineState, RunManifest, Scene, Tier
from src.video import render_pipeline

log = logging.getLogger("smoke_m2")


def _local_path(url: str) -> Path:
    assert url.startswith("file://"), f"expected file:// url, got {url!r}"
    return Path(urlparse(url).path)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    with tempfile.TemporaryDirectory() as tmp:
        import os
        os.environ["YUTE_LOCAL_STORAGE"] = tmp

        manifest = RunManifest(
            user_email="smoke-m2@example.com",
            original_prompt="smoke_m2",
            pipeline_state=PipelineState.RENDER,
            tier=Tier.STANDARD,
            budget_cents=4000,
            flags={"skip_video_gen": True},
            scenes=[
                Scene(
                    scene_number=1,
                    script="Welcome to the YuteStudio render smoke test.",
                    duration=4,
                    background_prompt="warm sunrise over a city skyline",
                ),
                Scene(
                    scene_number=2,
                    script="This is scene two, confirming per-scene assets.",
                    duration=4,
                    background_prompt="abstract blue wave pattern",
                ),
            ],
        )

        manifest = render_pipeline.run(manifest)

        assert manifest.pipeline_state != PipelineState.FAILED, "render pipeline failed"
        for s in manifest.scenes:
            assert s.background_image_url, f"scene {s.scene_number} missing image"
            img = _local_path(s.background_image_url)
            assert img.exists() and img.stat().st_size > 100, f"image not on disk: {img}"
            assert img.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n", f"not a PNG: {img}"

            audio_path = Path(tmp) / "nano" / "runs" / str(manifest.project_id) / "audio" / f"scene_{s.scene_number:02d}.wav"
            assert audio_path.exists() and audio_path.stat().st_size > 44, f"audio not on disk: {audio_path}"
            assert audio_path.read_bytes()[:4] == b"RIFF", f"not a WAV: {audio_path}"

        log.info(
            "ok: rendered %d scenes | spent %dc / budget %dc",
            len(manifest.scenes),
            manifest.spent_cents,
            manifest.budget_cents,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
