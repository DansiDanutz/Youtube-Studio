"""
Script generator (KimiClaw).

Input:  enhanced_prompt + research[] + (optional) answers to Q&A
Output: scenes[] — list of Scene objects, each 6-12 seconds of spoken text
        plus a background_prompt for the image generator and suggested b-roll.

Persists to video_projects.scenes jsonb AND inserts one row per scene into
video_scenes (so downstream render workers can pick them up).
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from src.manifest import PipelineState, ResearchItem, RunManifest, Scene

log = logging.getLogger(__name__)
MODEL = os.environ.get("YUTE_SCRIPT_MODEL", "claude-sonnet-4-6")

SYSTEM = (
    "You are KimiClaw, the YuteStudio script writer. Given an enhanced video "
    "prompt plus a ranked list of research items, produce a JSON object: "
    "{\"title\": string, \"scenes\": [Scene, ...]}. "
    "Each Scene has: scene_number (1-indexed int), script (the spoken text, "
    "6-12 seconds when read aloud — aim for 15-25 words), duration (int seconds), "
    "avatar_position ('left'|'right'|'center'|'none'), background_prompt (concise "
    "image gen prompt for the scene background), broll_images (array of short "
    "descriptive strings), transition ('cut'|'fade'|'slide'). "
    "Return 6-10 scenes totalling 60-90 seconds for short, 300-480 seconds for "
    "medium. Reply with a single JSON object — no prose, no markdown fences."
)


def generate_script(
    enhanced_prompt: str,
    research: list[ResearchItem],
    answers: dict[str, str] | None = None,
) -> tuple[str, list[Scene]]:
    """Pure function. Returns (title, scenes)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or not enhanced_prompt.strip():
        return _fallback(enhanced_prompt, research)

    try:
        from anthropic import Anthropic
    except ImportError:  # pragma: no cover
        log.warning("anthropic SDK missing → fallback")
        return _fallback(enhanced_prompt, research)

    user = _build_user_prompt(enhanced_prompt, research, answers or {})
    client = Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        log.warning("script gen: non-JSON response, falling back. raw=%r", text[:200])
        return _fallback(enhanced_prompt, research)

    title = str(data.get("title") or "").strip() or enhanced_prompt[:60]
    scenes = [_coerce_scene(i, s) for i, s in enumerate(data.get("scenes") or [], start=1)]
    return title, scenes


def _build_user_prompt(
    enhanced_prompt: str, research: list[ResearchItem], answers: dict[str, str]
) -> str:
    lines = ["ENHANCED PROMPT:", enhanced_prompt, "", "RESEARCH (top items):"]
    for r in research[:6]:
        lines.append(f"- [{r.source}] {r.title} ({r.url})")
        if r.snippet:
            lines.append(f"  {r.snippet[:280]}")
    if answers:
        lines.extend(["", "ANSWERS TO CLARIFYING QUESTIONS:"])
        for q, a in answers.items():
            lines.append(f"- Q: {q}  A: {a}")
    lines.extend(["", "Now produce the JSON object described in the system prompt."])
    return "\n".join(lines)


def _coerce_scene(idx: int, data: dict[str, Any]) -> Scene:
    return Scene(
        scene_number=int(data.get("scene_number") or idx),
        script=str(data.get("script") or "").strip(),
        duration=int(data.get("duration") or 8),
        avatar_position=data.get("avatar_position") or "left",
        background_prompt=str(data.get("background_prompt") or "").strip(),
        broll_images=[str(x) for x in (data.get("broll_images") or [])],
        transition=str(data.get("transition") or "cut"),
    )


def _fallback(enhanced_prompt: str, research: list[ResearchItem]) -> tuple[str, list[Scene]]:
    title = (enhanced_prompt[:60] + "...") if len(enhanced_prompt) > 60 else enhanced_prompt
    scenes = [
        Scene(scene_number=1, script=f"Hook — {enhanced_prompt[:80]}", duration=6,
              background_prompt="clean studio background, soft lighting"),
        Scene(scene_number=2, script="Context: here's why this matters today.", duration=8,
              background_prompt="abstract data visualization, blue tones"),
        Scene(scene_number=3, script="Main point one — explain the core idea.", duration=10,
              background_prompt="whiteboard with diagrams"),
        Scene(scene_number=4, script="Main point two — add an example.", duration=10,
              background_prompt="office desk with laptop"),
        Scene(scene_number=5, script="Main point three — counterpoint.", duration=10,
              background_prompt="split screen with contrasting visuals"),
        Scene(scene_number=6, script="Practical takeaway you can apply today.", duration=8,
              background_prompt="sunrise cityscape, uplifting"),
        Scene(scene_number=7, script="If you liked this, subscribe for more.", duration=5,
              background_prompt="animated subscribe button", avatar_position="center"),
    ]
    # Sprinkle b-roll hints from research titles
    for i, r in enumerate(research[:3]):
        if i < len(scenes):
            scenes[i + 1].broll_images.append(f"visual of: {r.title}")
    return title, scenes


# -------- dispatcher entrypoint --------
def run(manifest: RunManifest) -> RunManifest:
    title, scenes = generate_script(
        manifest.enhanced_prompt or manifest.original_prompt,
        manifest.research,
        manifest.answers,
    )
    manifest.title = manifest.title or title
    manifest.scenes = scenes

    try:
        from src.orchestrator.db import T_PROJECTS, T_SCENES, get_client

        client = get_client()
        client.table(T_PROJECTS).update(
            {
                "title": manifest.title,
                "scenes": [s.model_dump(mode="json") for s in scenes],
                "status": PipelineState.SCRIPT.value,
            }
        ).eq("id", str(manifest.project_id)).execute()
        # Clear any prior scene rows then insert fresh
        client.table(T_SCENES).delete().eq("project_id", str(manifest.project_id)).execute()
        if scenes:
            client.table(T_SCENES).insert(
                [
                    {
                        "project_id": str(manifest.project_id),
                        "scene_number": s.scene_number,
                        "script": s.script,
                        "duration": s.duration,
                        "avatar_position": s.avatar_position,
                        "background_prompt": s.background_prompt,
                        "broll_images": s.broll_images,
                        "text_overlays": s.text_overlays,
                        "transition": s.transition,
                        "status": "planned",
                    }
                    for s in scenes
                ]
            ).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("persist script failed: %s", exc)
    return manifest
