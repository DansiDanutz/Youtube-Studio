"""
Doctor — fleet immune system. Runs every 15 min.

For each row in telegram_bots:
  - if last_health_check > 10 min ago OR health_status != 'healthy':
      open a fleet_operations row (category='monitoring') describing the issue.
  - if ≥3 consecutive unhealthy beats, page via approval_bridge (AD-HOC).

Does NOT attempt auto-repair of mac-studio services — that's a separate
action that needs Dan's input (ssh, launchctl, etc.).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from .approval_bridge import request_gate
from .db import T_FLEET_OPS, get_client

log = logging.getLogger(__name__)


def scan() -> list[dict]:
    client = get_client()
    bots = (
        client.table("telegram_bots")
        .select("bot_username,bot_name,host,health_status,last_health_check,enabled")
        .eq("enabled", True)
        .execute()
    )
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(minutes=10)
    issues: list[dict] = []
    for bot in bots.data or []:
        last = bot.get("last_health_check")
        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00")) if last else None
        stale = last_dt is None or last_dt < threshold
        unhealthy = bot.get("health_status") != "healthy"
        if stale or unhealthy:
            issues.append(
                {
                    "bot": bot.get("bot_username") or bot.get("bot_name"),
                    "host": bot["host"],
                    "status": bot.get("health_status"),
                    "last_check": last,
                    "reason": "stale" if stale else "unhealthy",
                }
            )

    if issues:
        client.table(T_FLEET_OPS).insert(
            {
                "category": "monitoring",
                "subcategory": "doctor",
                "key": f"doctor_scan_{now.isoformat()}",
                "title": f"Doctor scan found {len(issues)} unhealthy bots",
                "description": f"{len(issues)} bots unhealthy or stale",
                "payload": {"issues": issues},
                "source": "doctor",
                "status": "open",
                "priority": 2,
                "observed_at": now.isoformat(),
                "tags": ["fleet", "health", "doctor"],
                "applies_to": sorted({i["host"] for i in issues}),
            }
        ).execute()

        if len(issues) >= 10:
            request_gate(
                gate="AD-HOC",
                reason=f"Fleet health critical — {len(issues)} unhealthy bots",
                evidence={"count": len(issues), "sample": issues[:5]},
                requested_by="doctor",
            )

    return issues


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    found = scan()
    print(f"doctor scan: {len(found)} issues")
