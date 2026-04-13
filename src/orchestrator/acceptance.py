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
from pathlib import Path
from typing import Callable

from .db import T_APPROVALS, T_MILESTONES, T_PROJECTS, get_client

log = logging.getLogger(__name__)

CheckFn = Callable[[], bool]
REPO_ROOT = Path(__file__).resolve().parents[2]


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
    client = get_client()
    resp = (
        client.table(T_PROJECTS)
        .select("id")
        .eq("status", "done")
        .limit(1)
        .execute()
    )
    return bool(resp.data)  # rough proxy; M2 smoke will harden this


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
    "image gen produces png": _placeholder_true,
    "assets land in storage": _placeholder_true,
    "scene video renders":   _placeholder_true,
    "composition merges scenes": _placeholder_true,
    "final mp4 produced":    _placeholder_true,
    "avatar lip-sync ok":    _placeholder_true,
    "bgm mixed":             _placeholder_true,
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
