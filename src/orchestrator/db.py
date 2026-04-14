"""Supabase client — single shared instance against MoltBot control plane."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)


# Table names — centralized so migrations only touch one place
T_PROJECTS = "video_projects"
T_SCENES = "video_scenes"
T_RENDERS = "video_renders"
T_RUN_META = "yute_run_meta"
T_APPROVALS = "yute_approvals"
T_MILESTONES = "yute_milestones"
T_GSD_TASKS = "gsd_tasks"
T_KANBAN = "kanban_activity"
T_AI_USAGE = "ai_usage"
T_FLEET_OPS = "fleet_operations"
T_AGENT_MESSAGES = "agent_messages"


def insert_render_record(
    client: Client,
    *,
    project_id: str,
    render_type: str,
    provider: str,
    output_url: str | None,
    scene_number: int | None = None,
    status: str = "done",
    bytes_written: int | None = None,
    duration_seconds: float | None = None,
    description: str | None = None,
    estimated_cost: float | None = None,
    estimated_render_time: float | None = None,
    input_data: dict[str, Any] | None = None,
) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    modern_payload = {
        "project_id": project_id,
        "scene_number": scene_number or 0,
        "asset_type": render_type,
        "provider": provider,
        "output_url": output_url,
        "bytes": bytes_written,
        "duration_seconds": duration_seconds,
        "status": status,
    }

    try:
        client.table(T_RENDERS).insert(modern_payload).execute()
        return
    except Exception:
        pass

    legacy_payload = {
        "project_id": project_id,
        "scene_id": None,
        "render_type": render_type,
        "provider": "vastai",
        "request_id": f"{render_type}_{project_id}_{scene_number or 0}",
        "status": status,
        "input_data": {"logical_provider": provider, **(input_data or {})},
        "output_url": output_url,
        "error_message": None,
        "duration_ms": int(duration_seconds * 1000) if duration_seconds is not None else None,
        "completed_at": now_iso,
        "final_video_url": output_url if render_type == "final" else None,
        "description": description or f"{render_type} asset",
        "estimated_cost": estimated_cost,
        "estimated_render_time": estimated_render_time,
    }
    client.table(T_RENDERS).insert(legacy_payload).execute()
