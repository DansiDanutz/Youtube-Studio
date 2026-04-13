"""
Budget guard — runs hot (every 1 min) and at every spend event.

Two scopes:
  1. Per-run:   `yute_run_meta.spent_cents >= yute_run_meta.budget_cents` → FAILED
  2. Per-month: Σ ai_usage.cost_usd this month ≥ YUTE_MONTHLY_BUDGET_CENTS → pause_all()

When the kill switch trips, every run in RENDER/REVIEW/MERGE state is frozen
and a yute_approvals row (gate='AD-HOC') is opened for Dan to approve a
manual override.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from decimal import Decimal

from .db import T_AI_USAGE, T_APPROVALS, T_RUN_META, get_client

log = logging.getLogger(__name__)


def monthly_spend_cents() -> int:
    """Σ ai_usage.cost_usd * 100 for rows created in the current calendar month."""
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    client = get_client()
    resp = (
        client.table(T_AI_USAGE)
        .select("cost_usd")
        .gte("created_at", start.isoformat())
        .execute()
    )
    total = Decimal("0")
    for row in resp.data or []:
        total += Decimal(str(row.get("cost_usd") or 0))
    return int(total * 100)


def monthly_cap_cents() -> int:
    return int(os.environ.get("YUTE_MONTHLY_BUDGET_CENTS", "30000"))


def can_spend(project_id: str, amount_cents: int) -> tuple[bool, str]:
    """Cheap pre-flight check. Caller should still re-read after debit."""
    client = get_client()
    meta = (
        client.table(T_RUN_META)
        .select("budget_cents, spent_cents, pipeline_state")
        .eq("project_id", project_id)
        .maybe_single()
        .execute()
    )
    if not meta.data:
        return False, f"no yute_run_meta row for {project_id}"
    remaining = int(meta.data["budget_cents"]) - int(meta.data["spent_cents"])
    if amount_cents > remaining:
        return False, f"run over budget: need {amount_cents}¢ have {remaining}¢"
    if monthly_spend_cents() + amount_cents > monthly_cap_cents():
        return False, "monthly cap would be exceeded"
    return True, "ok"


def debit(project_id: str, amount_cents: int, note: str = "") -> None:
    """Record a spend against a run. Caller must call_can_spend first."""
    client = get_client()
    meta = (
        client.table(T_RUN_META)
        .select("spent_cents")
        .eq("project_id", project_id)
        .single()
        .execute()
    )
    new_spent = int(meta.data["spent_cents"]) + amount_cents
    client.table(T_RUN_META).update({"spent_cents": new_spent}).eq(
        "project_id", project_id
    ).execute()
    log.info("debit %s: +%d¢ → %d¢ total (%s)", project_id, amount_cents, new_spent, note)


def kill_switch_check() -> bool:
    """Called by the 1-min scheduled task. Returns True if we tripped."""
    if monthly_spend_cents() >= monthly_cap_cents():
        log.warning("KILL SWITCH: monthly cap exceeded")
        _open_override_approval("monthly_cap_exceeded")
        return True
    return False


def _open_override_approval(reason: str) -> None:
    client = get_client()
    existing = (
        client.table(T_APPROVALS)
        .select("id")
        .eq("gate", "AD-HOC")
        .eq("decision", "pending")
        .eq("reason", reason)
        .execute()
    )
    if existing.data:
        return
    client.table(T_APPROVALS).insert(
        {
            "gate": "AD-HOC",
            "requested_by": "budget_guard",
            "decision": "pending",
            "reason": reason,
            "evidence": {
                "monthly_spend_cents": monthly_spend_cents(),
                "monthly_cap_cents": monthly_cap_cents(),
            },
        }
    ).execute()
