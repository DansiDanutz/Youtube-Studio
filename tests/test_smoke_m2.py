"""
M2 smoke test — offline render pipeline on a 2-scene manifest.

Verifies the Nano TTS + Dexter FLUX paths end-to-end without touching
any external service. All assets land under $YUTE_LOCAL_STORAGE.
"""
from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

import pytest

from src.manifest import PipelineState, RunManifest, Scene, Tier
from src.video import image_gen, render_pipeline, tts_engine


def _file_path(url: str) -> Path:
    assert url.startswith("file://"), url
    return Path(urlparse(url).path)


def test_tier_routing_tts() -> None:
    assert tts_engine.provider_for_tier(Tier.FREE) == "kokoro"
    assert tts_engine.provider_for_tier(Tier.STANDARD) == "chatterbox"
    assert tts_engine.provider_for_tier(Tier.PRO) == "chatterbox"
    assert tts_engine.provider_for_tier(Tier.ENTERPRISE) == "f5"


def test_tier_routing_image() -> None:
    assert image_gen.model_for_tier(Tier.FREE) == "flux-schnell"
    assert image_gen.model_for_tier(Tier.STANDARD) == "flux-schnell"
    assert image_gen.model_for_tier(Tier.PRO) == "flux-2"
    assert image_gen.model_for_tier(Tier.ENTERPRISE) == "flux-2"


def test_render_pipeline_offline(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))

    manifest = RunManifest(
        user_email="test@example.com",
        original_prompt="m2-smoke",
        pipeline_state=PipelineState.RENDER,
        tier=Tier.STANDARD,
        budget_cents=4000,
        flags={"skip_video_gen": True},  # M2 smoke — audio+image only
        scenes=[
            Scene(
                scene_number=1,
                script="Hello world, this is scene one of the smoke test.",
                duration=3,
                background_prompt="warm sunrise over a city skyline",
            ),
            Scene(
                scene_number=2,
                script="And here is scene two, validating the pipeline.",
                duration=3,
                background_prompt="abstract blue wave pattern",
            ),
        ],
    )

    out = render_pipeline.run(manifest)

    assert out.pipeline_state != PipelineState.FAILED
    assert out.spent_cents == 2 * (tts_engine.PER_SCENE_BUDGET_CENTS + image_gen.PER_SCENE_BUDGET_CENTS)

    for scene in out.scenes:
        # Images
        assert scene.background_image_url, "image URL not set"
        img = _file_path(scene.background_image_url)
        assert img.exists() and img.stat().st_size > 100
        assert img.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
        # Audio — check via direct storage URL
        audio = tmp_path / "nano" / "runs" / str(manifest.project_id) / "audio" / f"scene_{scene.scene_number:02d}.wav"
        assert audio.exists() and audio.stat().st_size > 44
        assert audio.read_bytes()[:4] == b"RIFF"


def test_render_pipeline_budget_guard(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))

    # 2 scenes × (200 + 300) = 1000c required; give only 100c.
    manifest = RunManifest(
        user_email="test@example.com",
        original_prompt="budget-fail",
        pipeline_state=PipelineState.RENDER,
        tier=Tier.STANDARD,
        budget_cents=100,
        scenes=[
            Scene(scene_number=1, script="scene 1", duration=3, background_prompt="x"),
            Scene(scene_number=2, script="scene 2", duration=3, background_prompt="y"),
        ],
    )
    out = render_pipeline.run(manifest)
    assert out.pipeline_state == PipelineState.FAILED
    assert out.flags.get("render_blocked") == "insufficient_budget"


def test_offline_png_is_valid(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))
    manifest = RunManifest(
        user_email="t@example.com",
        original_prompt="p",
        tier=Tier.FREE,
        scenes=[Scene(scene_number=1, script="s", duration=2, background_prompt="mist on a lake")],
    )
    out = image_gen.run(manifest)
    url = out.scenes[0].background_image_url
    assert url and url.startswith("file://")
    img_bytes = _file_path(url).read_bytes()
    # PNG header + at least IHDR and IEND chunks
    assert img_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    assert b"IHDR" in img_bytes and b"IEND" in img_bytes
