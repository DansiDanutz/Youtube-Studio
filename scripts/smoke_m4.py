#!/usr/bin/env python3
"""
M4 smoke — avatar lip-sync (Sienna) + BGM (AudioCraft) + audio mix, through
to a final MP4 whose audio track is the mixed voice+BGM wav.

Offline: avatar passthrough, BGM silent-WAV, FFmpeg does the concat + mux.

Run:  python -m scripts.smoke_m4
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

log = logging.getLogger("smoke_m4")


def _path(url: str) -> Path:
    assert url.startswith("file://"), url
    return Path(urlparse(url).path)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    have_ffmpeg = shutil.which("ffmpeg") is not None
    log.info("ffmpeg available: %s", have_ffmpeg)

    with tempfile.TemporaryDirectory() as tmp:
        import os
        os.environ["YUTE_LOCAL_STORAGE"] = tmp

        manifest = RunManifest(
            user_email="smoke-m4@example.com",
            original_prompt="smoke_m4",
            title="M4 smoke: avatar + BGM",
            pipeline_state=PipelineState.RENDER,
            tier=Tier.STANDARD,
            avatar_id="avatar_smoke_01",
            budget_cents=8000,
            scenes=[
                Scene(scene_number=1, script="Scene one of the avatar smoke.", duration=3,
                      background_prompt="sunrise over mountains"),
                Scene(scene_number=2, script="Scene two, with background music.", duration=3,
                      background_prompt="warm studio light"),
            ],
        )

        manifest = render_pipeline.run(manifest)
        assert manifest.pipeline_state != PipelineState.FAILED, "render failed"
        for s in manifest.scenes:
            assert s.video_url, f"scene {s.scene_number} missing video_url"

        manifest = composer.run(manifest)
        assert manifest.final_video_url, "composer: no final_video_url"
        final = _path(manifest.final_video_url)
        assert final.exists() and final.stat().st_size > 0

        bgm_url = manifest.metadata.get("bgm_url")
        mix_url = manifest.metadata.get("mixed_audio_url")
        assert bgm_url and bgm_url.startswith("file://"), "bgm_url missing"
        assert mix_url and mix_url.startswith("file://"), "mixed_audio_url missing"
        assert _path(bgm_url).exists(), "bgm file missing"
        assert _path(mix_url).exists(), "mixed audio missing"

        log.info(
            "ok: final=%s bytes=%d bgm=%s mix=%s spent=%dc",
            manifest.final_video_url,
            final.stat().st_size,
            bgm_url,
            mix_url,
            manifest.spent_cents,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
