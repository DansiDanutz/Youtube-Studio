"""M4 smoke — avatar, BGM, mixer, and the full RENDER→MERGE pipeline."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

import pytest

from src.audio import bgm_gen, mixer
from src.manifest import PipelineState, RunManifest, Scene, Tier
from src.video import avatar, composer, render_pipeline, tts_engine


def _path(url: str) -> Path:
    assert url.startswith("file://"), url
    return Path(urlparse(url).path)


def test_avatar_tier_routing() -> None:
    assert avatar.model_for_tier(Tier.FREE) == "wav2lip"
    assert avatar.model_for_tier(Tier.STANDARD) == "sadtalker"
    assert avatar.model_for_tier(Tier.PRO) == "musetalk"
    assert avatar.model_for_tier(Tier.ENTERPRISE) == "liveportrait"


def test_avatar_skipped_without_avatar_id(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))
    manifest = RunManifest(
        user_email="t@e.com", original_prompt="p", tier=Tier.STANDARD,
        scenes=[Scene(scene_number=1, script="s", duration=2, background_prompt="x", video_url="file:///nonexistent")],
    )
    out = avatar.run(manifest)
    # avatar_id was None — video_url should be untouched (pointed at nonexistent path).
    assert out.scenes[0].video_url == "file:///nonexistent"


def test_bgm_produces_wav(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))
    manifest = RunManifest(
        user_email="t@e.com", original_prompt="p", title="ocean waves",
        tier=Tier.STANDARD,
        scenes=[Scene(scene_number=1, script="s", duration=2, background_prompt="x")],
    )
    out = bgm_gen.run(manifest)
    url = out.metadata.get("bgm_url")
    assert url and url.startswith("file://")
    wav = _path(url).read_bytes()
    assert wav[:4] == b"RIFF"
    assert out.metadata.get("bgm_prompt", "").startswith("upbeat cinematic")


def test_mixer_produces_mixed_audio(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))
    manifest = RunManifest(
        user_email="t@e.com", original_prompt="p", tier=Tier.STANDARD,
        scenes=[
            Scene(scene_number=1, script="hello scene one", duration=2, background_prompt="x"),
            Scene(scene_number=2, script="hello scene two", duration=2, background_prompt="y"),
        ],
    )
    manifest = tts_engine.run(manifest)       # lay down voice WAVs
    manifest = bgm_gen.run(manifest)          # lay down BGM WAV
    manifest = mixer.run(manifest)
    url = manifest.metadata.get("mixed_audio_url")
    assert url and url.startswith("file://"), "mixed_audio_url missing"
    mixed = _path(url).read_bytes()
    assert mixed[:4] == b"RIFF"
    assert manifest.metadata.get("mix_mode") in ("mixed", "voice_only")


def test_full_render_plus_compose_with_avatar_and_bgm(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("YUTE_LOCAL_STORAGE", str(tmp_path))
    manifest = RunManifest(
        user_email="t@e.com",
        original_prompt="m4 pipeline",
        title="M4 avatar + BGM",
        pipeline_state=PipelineState.RENDER,
        tier=Tier.STANDARD,
        avatar_id="avatar_test_01",
        budget_cents=8000,
        scenes=[
            Scene(scene_number=1, script="Scene one.", duration=2, background_prompt="a"),
            Scene(scene_number=2, script="Scene two.", duration=2, background_prompt="b"),
        ],
    )

    out = render_pipeline.run(manifest)
    assert out.pipeline_state != PipelineState.FAILED
    # 2 × (200 + 300 + 800 + 400) = 3400c
    expected = 2 * (200 + 300 + 800 + 400)
    assert out.spent_cents == expected

    out = composer.run(out)
    assert out.final_video_url, "final_video_url missing"
    assert out.metadata.get("bgm_url", "").startswith("file://")
    assert out.metadata.get("mixed_audio_url", "").startswith("file://")
    assert _path(out.final_video_url).exists()
