"""Supabase client — single shared instance against MoltBot control plane."""
from __future__ import annotations

import os
from functools import lru_cache

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
