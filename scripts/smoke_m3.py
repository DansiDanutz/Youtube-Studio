#!/usr/bin/env python3
"""
M3 smoke — end-to-end through RENDER → MERGE, producing a final MP4.

Offline mode: TTS + image gen fall back to deterministic stubs; video_gen
uses local FFmpeg (if installed) to mux each scene's PNG + WAV into an MP4;
composer concats them.

If ffmpeg is NOT installed, the smoke still passes: video_gen writes a
valid ftyp-box placeholder and composer falls back to single-scene mode.

Run:  python -m scripts.smoke_m3
"""
from __future__ import annotations

import logging
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from src.manifest import PipelineState, RunManifest, Scene, Tier
from src.video import composer, render_pipeline

log = logging.getLogger("smoke_m3")


def _local_path(url: str) -> Path:
    assert url.startswith("file://"), f"expected file:// url, got {url!r}"
    return Path(urlparse(url).path)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    have_ffmpeg = shutil.which("ffmpeg") is not None
    log.info("ffmpeg available: %s", have_ffmpeg)

    with tempfile.TemporaryDirectory() as tmp:
        import os
        os.environ["YUTE_LOCAL_STORAGE"] = tmp

        manifest = RunManifest(
            user_email="smoke-m3@example.com",
            original_prompt="smoke_m3",
            pipeline_state=PipelineState.RENDER,
            tier=Tier.STANDARD,
            budget_cents=6000,
            scenes=[
                Scene(scene_number=1, script="Scene one of the M3 smoke.", duration=3,
                      background_prompt="warm sunrise over a city"),
                Scene(scene_number=2, script="Scene two of the M3 smoke.", duration=3,
                      background_prompt="calm blue wave pattern"),
            ],
        )

        manifest = render_pipeline.run(manifest)
        assert manifest.pipeline_state != PipelineState.FAILED, "render pipeline failed"

        for s in manifest.scenes:
            assert s.video_url, f"scene {s.scene_number} missing video_url"
            mp4 = _local_path(s.video_url)
            assert mp4.exists() and mp4.stat().st_size > 0, f"scene mp4 missing: {mp4}"

        manifest = composer.run(manifest)
        assert manifest.final_video_url, "composer produced no final_video_url"
        final = _local_path(manifest.final_video_url)
        assert final.exists() and final.stat().st_size > 0, f"final mp4 missing: {final}"

        log.info(
            "ok: final=%s size=%d scenes=%d spent=%dc",
            manifest.final_video_url,
            final.stat().st_size,
            len(manifest.scenes),
            manifest.spent_cents,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
