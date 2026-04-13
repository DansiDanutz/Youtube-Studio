"""
Prompt enhancer (KimiClaw).

Takes `video_projects.original_prompt` → produces:
  - enhanced_prompt: richer description with genre, audience, tone
  - questions[]: 3-5 clarifying questions Dan can answer to tighten scope

The model is called via Anthropic's API by default (model configurable via
YUTE_PROMPT_MODEL). A deterministic fallback is used when ANTHROPIC_API_KEY is
absent so that tests and scaffolding smoke checks can run without network.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

from src.manifest import PipelineState, RunManifest

log = logging.getLogger(__name__)

MODEL = os.environ.get("YUTE_PROMPT_MODEL", "claude-sonnet-4-6")
MAX_QUESTIONS = 5


SYSTEM = (
    "You are KimiClaw, the YuteStudio prompt enhancer. "
    "Given a user's raw video idea, produce: "
    "(1) an enhanced_prompt — a single paragraph richer description that names "
    "the genre (explainer, vlog, tutorial, story, news), intended audience, tone, "
    "target length in minutes, and 3-5 key beats; "
    "(2) questions — a JSON array of 3 to 5 short clarifying questions you need "
    "answered to tighten scope.\n\n"
    "Reply with a single JSON object: "
    "{\"enhanced_prompt\": string, \"questions\": [string,...]}. "
    "No prose, no markdown fences."
)


@dataclass
class Enhanced:
    enhanced_prompt: str
    questions: list[str]


def enhance(original_prompt: str) -> Enhanced:
    """Pure function — no DB. Returns enhanced_prompt + questions."""
    if not original_prompt.strip():
        return Enhanced(enhanced_prompt="", questions=[])

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        log.info("ANTHROPIC_API_KEY absent → using deterministic fallback")
        return _fallback(original_prompt)

    try:
        from anthropic import Anthropic  # imported lazily to keep tests light
    except ImportError:  # pragma: no cover
        log.warning("anthropic SDK not installed → fallback")
        return _fallback(original_prompt)

    client = Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM,
        messages=[{"role": "user", "content": original_prompt}],
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        log.warning("enhancer: model returned non-JSON, falling back. raw=%r", text[:200])
        return _fallback(original_prompt)

    return Enhanced(
        enhanced_prompt=str(data.get("enhanced_prompt") or "").strip(),
        questions=[str(q).strip() for q in (data.get("questions") or [])][:MAX_QUESTIONS],
    )


def _fallback(original_prompt: str) -> Enhanced:
    """Offline deterministic output — good enough for smoke tests."""
    return Enhanced(
        enhanced_prompt=(
            f"Explainer video (target 6-8 minutes, general audience, conversational "
            f"tone) about: {original_prompt.strip()}. Key beats: hook, context, three "
            f"main ideas with examples, practical takeaway, subscribe CTA."
        ),
        questions=[
            "Who is the target viewer — beginners or people already familiar?",
            "What's the single takeaway you want them to remember?",
            "Should we include on-screen code/diagrams, or keep it talking-head?",
            "Approximate length: shorter (3-4 min), medium (6-8 min), or long (12-15 min)?",
            "Any competitors' videos we should intentionally differ from?",
        ],
    )


# ---------------- dispatcher entrypoint ----------------
def run(manifest: RunManifest) -> RunManifest:
    """Dispatcher contract: takes a manifest in PROMPT state, returns it populated."""
    result = enhance(manifest.original_prompt)
    manifest.enhanced_prompt = result.enhanced_prompt
    manifest.questions = result.questions
    # Persist to video_projects
    try:
        from src.orchestrator.db import T_PROJECTS, get_client

        get_client().table(T_PROJECTS).update(
            {
                "enhanced_prompt": result.enhanced_prompt,
                "questions": result.questions,
                "status": PipelineState.PROMPT.value,
            }
        ).eq("id", str(manifest.project_id)).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("persist enhance failed: %s", exc)
    return manifest
