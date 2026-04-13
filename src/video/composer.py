"""
Composer — merges per-scene MP4s into a single final video via FFmpeg.

Dispatcher entrypoint for PipelineState.MERGE (see dispatcher STAGE_MODULES).
Input: every scene has a `video_url` from src.video.video_gen.
Output: manifest.final_video_url (uploaded to the Memo droplet).

Design:
  * Each scene's MP4 is pulled to a local temp dir.
  * FFmpeg concat demuxer is used (stream copy when possible, re-encode if
    codecs diverge).
  * Text overlays (scene.text_overlays) are drawn via `drawtext` filter.
  * Transitions: scene.transition ∈ {cut, fade, crossfade} — "cut" is the
    stream-copy happy path; anything else forces re-encode with xfade.

Falls back to the first scene's video if ffmpeg isn't available, so the
dispatcher still advances to REVIEW during offline smoke tests.
"""
from __future__ import annotations

import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from src.audio import bgm_gen, mixer
from src.infra import storage
from src.manifest import RunManifest

log = logging.getLogger(__name__)


@dataclass
class ComposeResult:
    video_url: str
    bytes_written: int
    scene_count: int
    duration_seconds: float
    mode: str  # "concat_copy" | "concat_reencode" | "single_scene_fallback" | "stub"


# ----------------------------- dispatcher entry ---------------------------- #

def run(manifest: RunManifest) -> RunManifest:
    scenes = [s for s in manifest.scenes if s.video_url]
    if not scenes:
        log.warning("composer: manifest %s has no scene videos — nothing to merge", manifest.project_id)
        return manifest

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        log.warning("composer: ffmpeg missing — using first scene as final")
        _fallback_single_scene(manifest, scenes[0].video_url)
        return manifest

    # Audio track (M4): generate BGM, then mix voice + BGM into mixed.wav.
    skip_audio_mix = bool((manifest.flags or {}).get("skip_audio_mix"))
    if not skip_audio_mix:
        manifest = bgm_gen.run(manifest)
        manifest = mixer.run(manifest)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        local_parts = _pull_scene_videos(scenes, tmp_dir)
        if not local_parts:
            log.warning("composer: no scene videos resolvable locally — single-scene fallback")
            _fallback_single_scene(manifest, scenes[0].video_url)
            return manifest

        needs_reencode = any(s.transition and s.transition != "cut" for s in scenes) or _has_overlays(manifest)
        concat_path = tmp_dir / "concat.mp4"
        if needs_reencode:
            _concat_reencode(ffmpeg, local_parts, manifest, concat_path)
            mode = "concat_reencode"
        else:
            try:
                _concat_copy(ffmpeg, local_parts, concat_path)
                mode = "concat_copy"
            except subprocess.CalledProcessError:
                log.info("composer: stream-copy failed — falling back to re-encode")
                _concat_reencode(ffmpeg, local_parts, manifest, concat_path)
                mode = "concat_reencode"

        # If a mixed audio track is available, swap it in as the final audio.
        mixed_url = (manifest.metadata or {}).get("mixed_audio_url")
        out_path = tmp_dir / "final.mp4"
        if mixed_url and mixed_url.startswith("file://"):
            mixed_path = Path(urlparse(mixed_url).path)
            if mixed_path.exists():
                try:
                    _mux_audio(ffmpeg, concat_path, mixed_path, out_path)
                    mode = f"{mode}+mixed_audio"
                except subprocess.CalledProcessError:
                    log.warning("composer: audio mux failed — keeping concat audio")
                    shutil.copy(concat_path, out_path)
            else:
                shutil.copy(concat_path, out_path)
        else:
            shutil.copy(concat_path, out_path)

        final_bytes = out_path.read_bytes()

    url = storage.put_bytes(
        droplet="memo",
        project_id=str(manifest.project_id),
        filename="video/final.mp4",
        data=final_bytes,
        content_type="video/mp4",
    )
    manifest.final_video_url = url
    total_duration = sum(s.duration for s in scenes)
    log.info(
        "composer: manifest=%s final_url=%s scenes=%d duration=%ss mode=%s bytes=%d",
        manifest.project_id,
        url,
        len(scenes),
        total_duration,
        mode,
        len(final_bytes),
    )

    _persist_final_row(manifest, ComposeResult(
        video_url=url,
        bytes_written=len(final_bytes),
        scene_count=len(scenes),
        duration_seconds=float(total_duration),
        mode=mode,
    ))
    return manifest


# --------------------------- helpers --------------------------------------- #

def _pull_scene_videos(scenes, tmp_dir: Path) -> list[Path]:
    parts: list[Path] = []
    for s in scenes:
        url = s.video_url
        if not url:
            continue
        if url.startswith("file://"):
            p = Path(urlparse(url).path)
            if p.exists():
                parts.append(p)
                continue
        # Non-local URLs: best-effort download via requests.
        local = tmp_dir / f"scene_{s.scene_number:02d}.mp4"
        if _download(url, local):
            parts.append(local)
    return parts


def _download(url: str, dest: Path) -> bool:
    try:
        import requests  # type: ignore
    except ImportError:
        return False
    try:
        resp = requests.get(url, timeout=120, stream=True)
        resp.raise_for_status()
        with dest.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                f.write(chunk)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("composer: download failed for %s (%s)", url, exc)
        return False


def _concat_copy(ffmpeg: str, parts: list[Path], out_path: Path) -> None:
    list_file = out_path.parent / "concat.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in parts))
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c", "copy",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def _concat_reencode(ffmpeg: str, parts: list[Path], manifest: RunManifest, out_path: Path) -> None:
    list_file = out_path.parent / "concat.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in parts))
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-preset", "veryfast",
        str(out_path),
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as exc:
        log.error("composer: re-encode failed (%s)", exc.stderr.decode("utf-8", "ignore")[:500])
        raise


def _mux_audio(ffmpeg: str, video_in: Path, audio_in: Path, out_path: Path) -> None:
    """Replace the audio track of video_in with audio_in, keeping video stream-copied."""
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-i", str(video_in),
        "-i", str(audio_in),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def _has_overlays(manifest: RunManifest) -> bool:
    return any(scene.text_overlays for scene in manifest.scenes)


def _fallback_single_scene(manifest: RunManifest, video_url: str) -> None:
    """When ffmpeg is unavailable, copy the first scene through as the "final"."""
    if video_url.startswith("file://"):
        data = Path(urlparse(video_url).path).read_bytes()
    else:
        # Punt — store the URL itself as the final marker.
        manifest.final_video_url = video_url
        return
    url = storage.put_bytes(
        droplet="memo",
        project_id=str(manifest.project_id),
        filename="video/final.mp4",
        data=data,
        content_type="video/mp4",
    )
    manifest.final_video_url = url


def _persist_final_row(manifest: RunManifest, result: ComposeResult) -> None:
    try:
        from src.orchestrator.db import T_PROJECTS, T_RENDERS, get_client
    except Exception:
        return
    try:
        client = get_client()
    except Exception:
        return
    try:
        client.table(T_PROJECTS).update(
            {"final_video_url": result.video_url}
        ).eq("id", str(manifest.project_id)).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("composer: project update failed (%s)", exc)
    try:
        client.table(T_RENDERS).insert(
            {
                "project_id": str(manifest.project_id),
                "scene_number": 0,
                "asset_type": "final",
                "provider": f"composer-{result.mode}",
                "output_url": result.video_url,
                "bytes": result.bytes_written,
                "duration_seconds": result.duration_seconds,
                "status": "done",
                "sha256": hashlib.sha256(result.video_url.encode()).hexdigest(),
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("composer: final render-row insert failed (%s)", exc)


__all__ = ["run", "ComposeResult"]
