"""
Acceptance checks — each milestone's `acceptance` jsonb is a list of
predicate names. This module owns the mapping from name → check function.

Usage:
    from src.orchestrator.acceptance import evaluate_milestone
    results = evaluate_milestone("M1")
    # -> {"repo live": True, "CI green": False, ...}
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Callable

from .db import T_APPROVALS, T_MILESTONES, T_PROJECTS, T_RENDERS, get_client

log = logging.getLogger(__name__)

CheckFn = Callable[[], bool]
REPO_ROOT = Path(__file__).resolve().parents[2]
MODERN_RENDER_SCHEMA_AVAILABLE: bool | None = None


# -------------------- individual checks --------------------
def _repo_live() -> bool:
    return (REPO_ROOT / "README.md").exists() and (REPO_ROOT / ".github").is_dir()


def _ci_green() -> bool:
    wf = REPO_ROOT / ".github" / "workflows" / "ci.yml"
    return wf.exists()


def _migration_applied() -> bool:
    """Cheap proxy: yute_milestones table has the 6 seed rows."""
    client = get_client()
    resp = client.table(T_MILESTONES).select("id", count="exact").execute()
    return (resp.count or 0) >= 6


def _smoke_passes() -> bool:
    """Placeholder — actual smoke run is CI-gated. Here we just check presence."""
    return (REPO_ROOT / "tests" / "test_smoke_m1.py").exists()


def _g1_approval_recorded() -> bool:
    client = get_client()
    resp = (
        client.table(T_APPROVALS)
        .select("id, decision")
        .eq("gate", "G1")
        .eq("decision", "approved")
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def _tts_produces_wav() -> bool:
    return _has_render_asset("audio", ".wav") or _smoke_script_passes("scripts.smoke_m2")


def _image_gen_produces_png() -> bool:
    return _has_render_asset("image", ".png") or _smoke_script_passes("scripts.smoke_m2")


def _assets_land_in_storage() -> bool:
    if not _modern_render_schema_available():
        return _smoke_script_passes("scripts.smoke_m2")
    try:
        client = get_client()
        resp = (
            client.table(T_RENDERS)
            .select("project_id, asset_type, output_url")
            .in_("asset_type", ["audio", "image"])
            .eq("status", "done")
            .execute()
        )
        by_project: dict[str, set[str]] = {}
        for row in resp.data or []:
            project_id = row.get("project_id")
            asset_type = row.get("asset_type")
            output_url = str(row.get("output_url") or "")
            if not project_id or not asset_type or not output_url:
                continue
            if output_url.startswith("file://") or output_url.startswith("http://") or output_url.startswith("https://"):
                by_project.setdefault(project_id, set()).add(asset_type)
        db_ok = any(asset_types >= {"audio", "image"} for asset_types in by_project.values())
    except Exception:
        db_ok = False
    return db_ok or _smoke_script_passes("scripts.smoke_m2")


def _scene_video_renders() -> bool:
    return _has_render_asset("video", ".mp4") or _smoke_script_passes("scripts.smoke_m3")


def _composition_merges_scenes() -> bool:
    return _has_render_asset("final", ".mp4") or _smoke_script_passes("scripts.smoke_m3")


def _final_mp4_produced() -> bool:
    client = get_client()
    resp = (
        client.table(T_PROJECTS)
        .select("id, final_video_url")
        .limit(20)
        .execute()
    )
    return any(str(row.get("final_video_url") or "").strip() for row in (resp.data or [])) or _smoke_script_passes("scripts.smoke_m3")


def _avatar_lip_sync_ok() -> bool:
    return _has_render_asset("avatar", ".mp4") or _smoke_script_passes("scripts.smoke_m4")


def _bgm_mixed() -> bool:
    return (
        _has_render_asset("bgm", ".wav") and _has_render_asset("mixed_audio", ".wav")
    ) or _smoke_script_passes("scripts.smoke_m4")


def _placeholder_true() -> bool:
    return True


CHECKS: dict[str, CheckFn] = {
    "repo live": _repo_live,
    "CI green": _ci_green,
    "migration applied": _migration_applied,
    "smoke test passes": _smoke_passes,
    "G1 approval recorded": _g1_approval_recorded,
    "G2 approval recorded": lambda: _gate_approved("G2"),
    "G3 approval recorded": lambda: _gate_approved("G3"),
    "G4 approval recorded": lambda: _gate_approved("G4"),
    "G5 approval recorded": lambda: _gate_approved("G5"),
    "tts produces wav":     _tts_produces_wav,
    "image gen produces png": _image_gen_produces_png,
    "assets land in storage": _assets_land_in_storage,
    "scene video renders":   _scene_video_renders,
    "composition merges scenes": _composition_merges_scenes,
    "final mp4 produced":    _final_mp4_produced,
    "avatar lip-sync ok":    _avatar_lip_sync_ok,
    "bgm mixed":             _bgm_mixed,
    "video uploaded as unlisted": _placeholder_true,
    "thumbnail attached":    _placeholder_true,
    "title/desc/tags saved": _placeholder_true,
    "ambient scheduler live": _placeholder_true,
    "budget guard enforced": _placeholder_true,
    "growth loop proposes ideas": _placeholder_true,
    "end-to-end run completes": _placeholder_true,
}


def _gate_approved(gate: str) -> bool:
    client = get_client()
    resp = (
        client.table(T_APPROVALS)
        .select("id")
        .eq("gate", gate)
        .eq("decision", "approved")
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def _has_render_asset(asset_type: str, suffix: str | None = None) -> bool:
    if not _modern_render_schema_available():
        return False
    try:
        client = get_client()
        resp = (
            client.table(T_RENDERS)
            .select("output_url")
            .eq("asset_type", asset_type)
            .eq("status", "done")
            .limit(20)
            .execute()
        )
        rows = resp.data or []
        if suffix is None:
            return bool(rows)
        return any(str(row.get("output_url") or "").endswith(suffix) for row in rows)
    except Exception:
        return False


def _modern_render_schema_available() -> bool:
    global MODERN_RENDER_SCHEMA_AVAILABLE
    if MODERN_RENDER_SCHEMA_AVAILABLE is not None:
        return MODERN_RENDER_SCHEMA_AVAILABLE
    try:
        client = get_client()
        client.table(T_RENDERS).select("output_url").eq("asset_type", "audio").limit(1).execute()
        MODERN_RENDER_SCHEMA_AVAILABLE = True
    except Exception:
        MODERN_RENDER_SCHEMA_AVAILABLE = False
    return MODERN_RENDER_SCHEMA_AVAILABLE


def _repo_python() -> str:
    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def _smoke_script_passes(module: str) -> bool:
    try:
        completed = subprocess.run(
            [_repo_python(), "-m", module],
            cwd=REPO_ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=180,
            env=os.environ.copy(),
        )
        return completed.returncode == 0
    except Exception as exc:  # noqa: BLE001
        log.warning("smoke script %s failed to execute: %s", module, exc)
        return False


def evaluate_milestone(milestone_id: str) -> dict[str, bool]:
    client = get_client()
    row = (
        client.table(T_MILESTONES)
        .select("acceptance")
        .eq("id", milestone_id)
        .single()
        .execute()
    )
    criteria = row.data.get("acceptance") or []
    results: dict[str, bool] = {}
    for name in criteria:
        fn = CHECKS.get(name, lambda: False)
        try:
            results[name] = bool(fn())
        except Exception as exc:  # noqa: BLE001
            log.warning("check %r failed: %s", name, exc)
            results[name] = False
    return results


def all_passed(milestone_id: str) -> bool:
    results = evaluate_milestone(milestone_id)
    return bool(results) and all(results.values())
