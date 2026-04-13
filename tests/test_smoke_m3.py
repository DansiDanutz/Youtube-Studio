"""
M3 smoke — video_gen (Memo) + composer (final mp4).

Passes whether ffmpeg is installed or not: when absent we exercise the
stub-MP4 + single-scene composer fallback paths; when present we get a real
concatenated video.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from urllib.parse import urlparse

import pytest

from src.manifest import PipelineState, RunManifest, Scene, Tier
from src.video import composer, image_gen, render_pipeline, tts_engine, video_gen


def _path(url: str) -> Path:
    assert url.startswith("file://"), url
    return Path(urlparse(url).path)


def test_tier_routing_video() -> None:
    assert video_gen.model_for_tier(Tier.FREE) == "ltx-video"
    assert video_gen.model_for_tier(Tier.STANDARD) == "wan-2-2"
    assert video_gen.model_for_tier(Tier.PRO) == "wan-2-2"
    assert video_gen.model_for_tier(Tier.ENTERPRISE) == "hunyuan-video"


def test_video_gen_offline_produces_mp4(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))

    # Pre-populate image + audio that video_gen offline-muxes together.
    manifest = RunManifest(
        user_email="t@example.com",
        original_prompt="m3",
        tier=Tier.STANDARD,
        scenes=[
            Scene(scene_number=1, script="scene 1", duration=2, background_prompt="a"),
            Scene(scene_number=2, script="scene 2", duration=2, background_prompt="b"),
        ],
    )
    manifest = tts_engine.run(manifest)
    manifest = image_gen.run(manifest)
    manifest = video_gen.run(manifest)

    for scene in manifest.scenes:
        assert scene.video_url, "video_url should be set"
        mp4 = _path(scene.video_url)
        assert mp4.exists() and mp4.stat().st_size > 0


def test_composer_produces_final(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))

    manifest = RunManifest(
        user_email="t@example.com",
        original_prompt="compose",
        pipeline_state=PipelineState.RENDER,
        tier=Tier.STANDARD,
        budget_cents=6000,
        scenes=[
            Scene(scene_number=1, script="hello one", duration=2, background_prompt="x"),
            Scene(scene_number=2, script="hello two", duration=2, background_prompt="y"),
        ],
    )
    manifest = render_pipeline.run(manifest)
    assert manifest.pipeline_state != PipelineState.FAILED

    manifest = composer.run(manifest)
    assert manifest.final_video_url, "composer did not set final_video_url"
    final = _path(manifest.final_video_url)
    assert final.exists() and final.stat().st_size > 0


def test_render_pipeline_skips_video_when_budget_only_covers_m2(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))

    # 2 scenes × (200 + 300) = 1000c, no room for video_gen (800 × 2 = 1600c more).
    manifest = RunManifest(
        user_email="t@example.com",
        original_prompt="tight budget",
        pipeline_state=PipelineState.RENDER,
        tier=Tier.STANDARD,
        budget_cents=1000,  # exactly the M2 floor
        scenes=[
            Scene(scene_number=1, script="a", duration=2, background_prompt="a"),
            Scene(scene_number=2, script="b", duration=2, background_prompt="b"),
        ],
    )
    out = render_pipeline.run(manifest)
    assert out.pipeline_state != PipelineState.FAILED
    # No video_urls because video_gen was skipped on cost.
    assert all(s.video_url is None for s in out.scenes)
    assert out.spent_cents == 1000


def test_render_pipeline_includes_video_when_budget_allows(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))

    manifest = RunManifest(
        user_email="t@example.com",
        original_prompt="comfy budget",
        pipeline_state=PipelineState.RENDER,
        tier=Tier.STANDARD,
        budget_cents=6000,
        scenes=[
            Scene(scene_number=1, script="a", duration=2, background_prompt="a"),
            Scene(scene_number=2, script="b", duration=2, background_prompt="b"),
        ],
    )
    out = render_pipeline.run(manifest)
    assert out.pipeline_state != PipelineState.FAILED
    assert all(s.video_url is not None for s in out.scenes)
    # 2 × (200 + 300 + 800) = 2600c
    assert out.spent_cents == 2 * (
        tts_engine.PER_SCENE_BUDGET_CENTS
        + image_gen.PER_SCENE_BUDGET_CENTS
        + video_gen.PER_SCENE_BUDGET_CENTS
    )
