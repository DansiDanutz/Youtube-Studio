"""
Audio mixer — combines per-scene voice WAVs + BGM into one final audio track.

Runs on the Memo droplet (FFmpeg heavy). Output is stored on Memo under
`audio/mixed.wav` and recorded on `manifest.metadata["mixed_audio_url"]`.

Layout:

  [concat:voice_01.wav .. voice_NN.wav] ─► voice_full.wav
                                           │
                         bgm.wav ──────────┤  amix (voice 1.0, bgm 0.25)
                                           │
                                           ▼
                                  mixed.wav (final)

If ffmpeg or inputs are missing we fall back to the concatenated voice track
(no BGM) so the pipeline still produces a usable audio artifact.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from src.infra import storage
from src.manifest import RunManifest

log = logging.getLogger(__name__)

VOICE_LEVEL = "1.0"
BGM_LEVEL = "0.25"


@dataclass
class MixResult:
    url: str
    bytes_written: int
    duration_seconds: float
    mode: str  # "mixed" | "voice_only" | "empty"


def run(manifest: RunManifest) -> RunManifest:
    if not manifest.scenes:
        log.warning("mixer: no scenes — skipping")
        return manifest

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        log.warning("mixer: ffmpeg missing — skipping audio mix")
        return manifest

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        voice_parts = _resolve_voice_paths(manifest, tmp_dir)
        if not voice_parts:
            log.warning("mixer: no voice parts resolvable — skipping")
            return manifest

        voice_full = tmp_dir / "voice_full.wav"
        _concat_wavs(ffmpeg, voice_parts, voice_full)

        bgm_path = _resolve_bgm_path(manifest, tmp_dir)
        out_path = tmp_dir / "mixed.wav"
        mode = "mixed"
        if bgm_path and bgm_path.exists() and bgm_path.stat().st_size > 44:
            try:
                _mix(ffmpeg, voice_full, bgm_path, out_path)
            except subprocess.CalledProcessError as exc:
                log.warning("mixer: mix failed (%s) — falling back to voice-only", exc.stderr.decode("utf-8", "ignore")[:400])
                shutil.copy(voice_full, out_path)
                mode = "voice_only"
        else:
            shutil.copy(voice_full, out_path)
            mode = "voice_only"

        mixed_bytes = out_path.read_bytes()

    url = storage.put_bytes(
        droplet="memo",
        project_id=str(manifest.project_id),
        filename="audio/mixed.wav",
        data=mixed_bytes,
        content_type="audio/wav",
    )
    duration = float(sum(max(s.duration, 1) for s in manifest.scenes))
    manifest.metadata = {**(manifest.metadata or {}), "mixed_audio_url": url, "mix_mode": mode}
    log.info("mixer: manifest=%s url=%s mode=%s bytes=%d", manifest.project_id, url, mode, len(mixed_bytes))

    _persist_render_row(manifest, MixResult(url=url, bytes_written=len(mixed_bytes), duration_seconds=duration, mode=mode))
    return manifest


# --------------------------- helpers --------------------------------------- #

def _resolve_voice_paths(manifest: RunManifest, tmp_dir: Path) -> list[Path]:
    parts: list[Path] = []
    for scene in manifest.scenes:
        url = storage.url_for("nano", str(manifest.project_id), f"audio/scene_{scene.scene_number:02d}.wav")
        if url.startswith("file://"):
            p = Path(urlparse(url).path)
            if p.exists():
                parts.append(p)
    return parts


def _resolve_bgm_path(manifest: RunManifest, tmp_dir: Path) -> Path | None:
    url = (manifest.metadata or {}).get("bgm_url")
    if not url:
        return None
    if url.startswith("file://"):
        p = Path(urlparse(url).path)
        return p if p.exists() else None
    return None  # S3 download TBD


def _concat_wavs(ffmpeg: str, parts: list[Path], out_path: Path) -> None:
    list_file = out_path.parent / "voice_concat.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in parts))
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def _mix(ffmpeg: str, voice: Path, bgm: Path, out_path: Path) -> None:
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-i", str(voice),
        "-i", str(bgm),
        "-filter_complex",
        f"[0:a]volume={VOICE_LEVEL}[v];[1:a]volume={BGM_LEVEL}[b];[v][b]amix=inputs=2:duration=first:dropout_transition=0[out]",
        "-map", "[out]",
        "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def _persist_render_row(manifest: RunManifest, result: MixResult) -> None:
    try:
        from src.orchestrator.db import get_client, insert_render_record
    except Exception:
        return
    try:
        client = get_client()
    except Exception:
        return
    try:
        insert_render_record(
            client,
            project_id=str(manifest.project_id),
            scene_number=0,
            render_type="mixed_audio",
            provider=f"mixer-{result.mode}",
            output_url=result.url,
            bytes_written=result.bytes_written,
            duration_seconds=result.duration_seconds,
            description="Mixed voice and BGM WAV",
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("mixer: render-row insert failed (%s)", exc)


__all__ = ["run", "MixResult"]
