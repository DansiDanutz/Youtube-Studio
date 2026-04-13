#!/usr/bin/env python3
"""
M1 smoke — online mode. Creates a real run in MoltBot, walks it from IDEA
through SCRIPT, then opens a G1 approval via the bridge.

Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or anon),
              optional ANTHROPIC_API_KEY, optional SERPAPI_API_KEY.

Run:  python -m scripts.smoke_m1 --email you@example.com --prompt "your idea"
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from uuid import uuid4

from src.manifest import PipelineState, RunManifest, Tier
from src.orchestrator import dispatcher
from src.orchestrator.approval_bridge import request_gate
from src.orchestrator.db import T_PROJECTS, T_RUN_META, get_client

log = logging.getLogger("smoke_m1")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--tier", default="free")
    args = ap.parse_args()

    project_id = uuid4()
    client = get_client()

    client.table(T_PROJECTS).insert(
        {
            "id": str(project_id),
            "user_email": args.email,
            "original_prompt": args.prompt,
            "status": PipelineState.IDEA.value,
            "metadata": {"source": "smoke_m1"},
        }
    ).execute()
    client.table(T_RUN_META).insert(
        {
            "project_id": str(project_id),
            "tier": args.tier,
            "pipeline_state": PipelineState.IDEA.value,
            "budget_cents": 500,
        }
    ).execute()
    log.info("created run %s", project_id)

    manifest = RunManifest(
        project_id=project_id,
        user_email=args.email,
        original_prompt=args.prompt,
        tier=Tier(args.tier),
        pipeline_state=PipelineState.IDEA,
        budget_cents=500,
    )

    # Walk IDEA → PROMPT → RESEARCH → SCRIPT
    for _ in range(4):
        manifest = dispatcher.advance(manifest)
        log.info("state now %s", manifest.pipeline_state)
        client.table(T_RUN_META).update({"pipeline_state": manifest.pipeline_state}).eq(
            "project_id", str(project_id)
        ).execute()

    if not manifest.scenes:
        log.error("no scenes produced — smoke failed")
        return 1

    # Open G1
    approval_id = request_gate(
        gate="G1",
        milestone_id="M1",
        project_id=str(project_id),
        reason="M1 smoke test completed",
        evidence={
            "scenes": len(manifest.scenes),
            "research_items": len(manifest.research),
            "enhanced_prompt_len": len(manifest.enhanced_prompt),
        },
        requested_by="smoke_m1",
    )
    log.info("opened G1 approval #%s", approval_id)
    print(json.dumps({"project_id": str(project_id), "approval_id": approval_id}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
