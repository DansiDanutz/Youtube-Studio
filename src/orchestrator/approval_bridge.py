"""
Telegram bridge for G1..G5 gates.

GSD writes a yute_approvals row with decision='pending'. This module polls
those rows and pushes a Telegram message to Dan. Dan replies approve/reject.
The inbound webhook (src/api/main.py /telegram/webhook) flips decision and
fills approver + decided_at.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from pprint import pformat

import httpx

from src.env import load_repo_env
from .db import T_APPROVALS, get_client

log = logging.getLogger(__name__)

load_repo_env()

TG_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TG_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID") or os.environ.get("TELEGRAM_DAN_CHAT_ID", "")
TG_API = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"


def request_gate(
    gate: str,
    milestone_id: str | None = None,
    project_id: str | None = None,
    reason: str = "",
    evidence: dict | None = None,
    requested_by: str = "GSD",
) -> int:
    """Create a yute_approvals row and push a Telegram prompt. Returns row id."""
    client = get_client()
    resp = (
        client.table(T_APPROVALS)
        .insert(
            {
                "gate": gate,
                "milestone_id": milestone_id,
                "project_id": project_id,
                "requested_by": requested_by,
                "reason": reason,
                "evidence": evidence or {},
                "decision": "pending",
            }
        )
        .execute()
    )
    approval_id = resp.data[0]["id"]
    _push_telegram(gate, approval_id, reason, evidence or {})
    return approval_id


def _push_telegram(gate: str, approval_id: int, reason: str, evidence: dict) -> None:
    if not TG_BOT_TOKEN or not TG_CHAT_ID:
        log.info("telegram not configured, skipping push for approval %d", approval_id)
        return
    evidence_text = pformat(evidence, width=80, compact=True)
    text = (
        f"YuteStudio gate {gate}\n"
        f"approval_id: {approval_id}\n"
        f"reason: {reason or '(none)'}\n"
        f"evidence: {evidence_text}\n\n"
        f"Reply: /approve {approval_id} or /reject {approval_id} <reason>"
    )
    try:
        resp = httpx.post(
            TG_API,
            json={"chat_id": TG_CHAT_ID, "text": text},
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("telegram push failed: %s", exc)


def decide(approval_id: int, decision: str, approver: str, reason: str = "") -> None:
    """Called by the Telegram webhook when Dan approves/rejects."""
    assert decision in ("approved", "rejected"), decision
    client = get_client()
    client.table(T_APPROVALS).update(
        {
            "decision": decision,
            "approver": approver,
            "reason": reason,
            "decided_at": "now()",
        }
    ).eq("id", approval_id).execute()
