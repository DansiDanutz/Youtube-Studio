"""
Daily GSD roadmap loop.

Runs hourly (scheduled task). On each tick:
  1. Evaluate the active milestone's acceptance checks.
  2. If all pass, open a gate approval (G1..G5 per the milestone's `gate` field).
  3. When that approval is `approved`, mark milestone done and activate next_milestone.
  4. Log a kanban_activity row + an agent_messages row to Dexter.

Also computes a simple burn-up metric into fleet_operations (category='monitoring').
"""
from __future__ import annotations

import logging

from .acceptance import evaluate_milestone
from .approval_bridge import request_gate
from .db import T_APPROVALS, T_KANBAN, T_MILESTONES, get_client

log = logging.getLogger(__name__)


def active_milestone() -> dict | None:
    client = get_client()
    resp = (
        client.table(T_MILESTONES)
        .select("*")
        .in_("status", ["in_progress", "pending"])
        .order("id")
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def pending_gate_for(milestone_id: str, gate: str) -> dict | None:
    client = get_client()
    resp = (
        client.table(T_APPROVALS)
        .select("*")
        .eq("milestone_id", milestone_id)
        .eq("gate", gate)
        .eq("decision", "pending")
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def latest_decision_for(milestone_id: str, gate: str) -> dict | None:
    client = get_client()
    resp = (
        client.table(T_APPROVALS)
        .select("*")
        .eq("milestone_id", milestone_id)
        .eq("gate", gate)
        .in_("decision", ["approved", "rejected"])
        .order("decided_at", desc=True)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def tick() -> dict:
    """One GSD heartbeat. Returns a summary dict for logging."""
    client = get_client()
    ms = active_milestone()
    if not ms:
        return {"status": "idle", "note": "no active milestone"}

    results = evaluate_milestone(ms["id"])
    all_pass = bool(results) and all(results.values())
    gate_check_name = f"{ms['gate']} approval recorded" if ms.get("gate") else None
    non_gate_results = {
        name: passed for name, passed in results.items() if name != gate_check_name
    }
    gate_ready = bool(non_gate_results) and all(non_gate_results.values())

    summary: dict = {
        "milestone": ms["id"],
        "status": ms["status"],
        "acceptance": results,
        "all_pass": all_pass,
        "action": "wait",
    }

    # Flip pending→in_progress as soon as first check passes
    if ms["status"] == "pending" and any(results.values()):
        client.table(T_MILESTONES).update(
            {"status": "in_progress", "started_at": "now()"}
        ).eq("id", ms["id"]).execute()
        summary["action"] = "started"

    # If all acceptance passes and this milestone has a gate, check gate state
    if ms.get("gate") and gate_ready:
        approved = latest_decision_for(ms["id"], ms["gate"])
        if approved and approved["decision"] == "approved":
            # Mark done, activate next
            client.table(T_MILESTONES).update(
                {"status": "done", "completed_at": "now()"}
            ).eq("id", ms["id"]).execute()
            if ms.get("next_milestone"):
                client.table(T_MILESTONES).update(
                    {"status": "in_progress", "started_at": "now()"}
                ).eq("id", ms["next_milestone"]).execute()
            summary["action"] = "advanced_to_" + (ms.get("next_milestone") or "END")
        else:
            # Not yet requested → open the gate
            if not pending_gate_for(ms["id"], ms["gate"]):
                approval_id = request_gate(
                    gate=ms["gate"],
                    milestone_id=ms["id"],
                    reason=f"{ms['id']} acceptance passed",
                    evidence=results,
                    requested_by="gsd",
                )
                summary["action"] = f"opened_gate_{ms['gate']}#{approval_id}"
            else:
                summary["action"] = "awaiting_gate"

    # No-gate terminal milestone (M6) → auto-close when acceptance passes
    if all_pass and not ms.get("gate") and ms["status"] != "done":
        client.table(T_MILESTONES).update(
            {"status": "done", "completed_at": "now()"}
        ).eq("id", ms["id"]).execute()
        summary["action"] = "closed_no_gate"

    log.info("gsd tick: %s", summary)
    return summary


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    print(tick())
