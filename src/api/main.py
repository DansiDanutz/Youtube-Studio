"""
YuteStudio FastAPI — the HTTP surface exposed by M1.

Endpoints:
  POST /runs                        create a new run (returns project_id)
  GET  /runs/{project_id}           full manifest + current state
  POST /runs/{project_id}/advance   run one stage (dispatcher.advance)
  POST /runs/{project_id}/cancel    mark cancelled
  POST /approvals/{id}/decide       used by Telegram webhook
  POST /telegram/webhook            raw Telegram update ingestion
  GET  /health                      liveness probe (used by Doctor)
  GET  /milestones                  roadmap state
"""
from __future__ import annotations

import logging
import os
from typing import Any
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from src.manifest import PipelineState, RunManifest, Tier
from src.orchestrator import approval_bridge, dispatcher
from src.orchestrator.db import (
    T_APPROVALS,
    T_MILESTONES,
    T_PROJECTS,
    T_RUN_META,
    get_client,
)
from src.orchestrator.roadmap import tick as gsd_tick

log = logging.getLogger(__name__)

app = FastAPI(title="YuteStudio", version="0.1.0")


# --------------- request/response models ---------------
class CreateRun(BaseModel):
    user_email: EmailStr
    original_prompt: str = Field(..., min_length=1)
    tier: Tier = Tier.FREE
    title: str = ""
    avatar_id: str | None = None
    voice_id: str | None = None
    budget_cents: int | None = None


class AdvanceResult(BaseModel):
    project_id: UUID
    pipeline_state: PipelineState
    changed: bool


class Decision(BaseModel):
    decision: str  # "approved" | "rejected"
    approver: str
    reason: str = ""


# --------------- endpoints ---------------
@app.get("/health")
def health() -> dict[str, Any]:
    try:
        client = get_client()
        client.table(T_MILESTONES).select("id").limit(1).execute()
        return {"ok": True, "db": "up"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "db": "down", "error": str(exc)}


@app.post("/runs", status_code=201)
def create_run(body: CreateRun) -> dict[str, Any]:
    project_id = uuid4()
    budget = body.budget_cents or _default_budget_for(body.tier)
    client = get_client()
    client.table(T_PROJECTS).insert(
        {
            "id": str(project_id),
            "user_email": body.user_email,
            "title": body.title,
            "original_prompt": body.original_prompt,
            "avatar_id": body.avatar_id,
            "voice_id": body.voice_id,
            "status": PipelineState.IDEA.value,
            "metadata": {},
        }
    ).execute()
    client.table(T_RUN_META).insert(
        {
            "project_id": str(project_id),
            "tier": body.tier.value if isinstance(body.tier, Tier) else body.tier,
            "pipeline_state": PipelineState.IDEA.value,
            "budget_cents": budget,
        }
    ).execute()
    return {"project_id": str(project_id), "tier": body.tier, "budget_cents": budget}


@app.get("/runs/{project_id}")
def get_run(project_id: UUID) -> dict[str, Any]:
    client = get_client()
    proj = (
        client.table(T_PROJECTS)
        .select("*")
        .eq("id", str(project_id))
        .maybe_single()
        .execute()
    )
    if not proj.data:
        raise HTTPException(404, "run not found")
    meta = (
        client.table(T_RUN_META)
        .select("*")
        .eq("project_id", str(project_id))
        .maybe_single()
        .execute()
    )
    return {"project": proj.data, "meta": meta.data}


@app.post("/runs/{project_id}/advance", response_model=AdvanceResult)
def advance_run(project_id: UUID) -> AdvanceResult:
    manifest = _load_manifest(project_id)
    before = PipelineState(manifest.pipeline_state)
    manifest = dispatcher.advance(manifest)
    after = PipelineState(manifest.pipeline_state)
    _persist_meta_state(project_id, after)
    return AdvanceResult(project_id=project_id, pipeline_state=after, changed=before != after)


@app.post("/runs/{project_id}/cancel")
def cancel_run(project_id: UUID) -> dict[str, Any]:
    _persist_meta_state(project_id, PipelineState.CANCELLED)
    return {"ok": True, "project_id": str(project_id), "state": PipelineState.CANCELLED}


@app.post("/approvals/{approval_id}/decide")
def decide(approval_id: int, body: Decision) -> dict[str, Any]:
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be approved or rejected")
    approval_bridge.decide(
        approval_id, decision=body.decision, approver=body.approver, reason=body.reason
    )
    return {"ok": True, "approval_id": approval_id, "decision": body.decision}


@app.post("/telegram/webhook")
async def telegram_webhook(req: Request) -> dict[str, Any]:
    """Parses /approve <id> and /reject <id> <reason>."""
    update = await req.json()
    msg = (update.get("message") or {}).get("text", "")
    user = ((update.get("message") or {}).get("from") or {}).get("username") or "unknown"
    parts = msg.strip().split(maxsplit=2)
    if len(parts) < 2:
        return {"ok": False, "error": "need /approve|/reject <id>"}

    cmd = parts[0].lstrip("/").lower()
    if cmd not in ("approve", "reject"):
        return {"ok": False, "error": "unknown command"}
    try:
        approval_id = int(parts[1])
    except ValueError:
        return {"ok": False, "error": "invalid approval id"}

    reason = parts[2] if len(parts) == 3 else ""
    approval_bridge.decide(
        approval_id,
        decision="approved" if cmd == "approve" else "rejected",
        approver=user,
        reason=reason,
    )
    return {"ok": True, "approval_id": approval_id, "decision": cmd + "d"}


@app.get("/milestones")
def milestones() -> dict[str, Any]:
    client = get_client()
    resp = client.table(T_MILESTONES).select("*").order("id").execute()
    return {"milestones": resp.data}


@app.post("/gsd/tick")
def gsd_tick_endpoint() -> dict[str, Any]:
    """Called by the scheduled-task executor. Idempotent."""
    return gsd_tick()


# --------------- helpers ---------------
def _default_budget_for(tier: Tier) -> int:
    return {
        Tier.FREE: 300,
        Tier.STANDARD: 1500,
        Tier.PRO: 5000,
        Tier.ENTERPRISE: 20000,
    }[tier]


def _persist_meta_state(project_id: UUID, state: PipelineState) -> None:
    client = get_client()
    client.table(T_RUN_META).update({"pipeline_state": state.value}).eq(
        "project_id", str(project_id)
    ).execute()
    client.table(T_PROJECTS).update({"status": state.value}).eq(
        "id", str(project_id)
    ).execute()


def _load_manifest(project_id: UUID) -> RunManifest:
    client = get_client()
    proj = (
        client.table(T_PROJECTS)
        .select("*")
        .eq("id", str(project_id))
        .maybe_single()
        .execute()
    )
    if not proj.data:
        raise HTTPException(404, "run not found")
    meta = (
        client.table(T_RUN_META)
        .select("*")
        .eq("project_id", str(project_id))
        .maybe_single()
        .execute()
    )
    md = meta.data or {}
    p = proj.data
    return RunManifest(
        project_id=UUID(p["id"]),
        user_email=p.get("user_email") or "unknown@example.com",
        title=p.get("title") or "",
        original_prompt=p.get("original_prompt") or "",
        enhanced_prompt=p.get("enhanced_prompt") or "",
        questions=p.get("questions") or [],
        answers=p.get("answers") or {},
        avatar_id=p.get("avatar_id"),
        voice_id=p.get("voice_id"),
        voice_provider=p.get("voice_provider"),
        scenes=p.get("scenes") or [],
        tier=Tier(md.get("tier") or "free"),
        pipeline_state=PipelineState(md.get("pipeline_state") or p.get("status") or "IDEA"),
        budget_cents=int(md.get("budget_cents") or 300),
        spent_cents=int(md.get("spent_cents") or 0),
        flags=md.get("flags") or {},
        metrics=md.get("metrics") or {},
        metadata=p.get("metadata") or {},
        thumbnail_url=p.get("thumbnail_url"),
        final_video_url=p.get("final_video_url"),
    )


# local dev: `uvicorn src.api.main:app --reload`
if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
