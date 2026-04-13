"""
Run Manifest — Pydantic models mirroring the MoltBot schema.

Maps onto:
  - video_projects   (1 row per run)
  - video_scenes     (1 row per scene in manifest.scenes)
  - yute_run_meta    (1 row per run — tier, pipeline_state, budget)
  - yute_approvals   (N rows per run — gate requests G1..G5)
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, ConfigDict


class PipelineState(str, Enum):
    IDEA = "IDEA"
    PROMPT = "PROMPT"
    RESEARCH = "RESEARCH"
    SCRIPT = "SCRIPT"
    RENDER = "RENDER"
    REVIEW = "REVIEW"
    MERGE = "MERGE"
    PUBLISH = "PUBLISH"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


PIPELINE_ORDER: list[PipelineState] = [
    PipelineState.IDEA,
    PipelineState.PROMPT,
    PipelineState.RESEARCH,
    PipelineState.SCRIPT,
    PipelineState.RENDER,
    PipelineState.REVIEW,
    PipelineState.MERGE,
    PipelineState.PUBLISH,
]


class Tier(str, Enum):
    FREE = "free"
    STANDARD = "standard"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class ResearchItem(BaseModel):
    source: str                           # e.g. "serpapi", "youtube-transcript", "playwright"
    url: str
    title: str
    snippet: str = ""
    published_at: datetime | None = None
    score: float = 0.0                    # ranker output 0..1
    raw: dict[str, Any] = Field(default_factory=dict)


class Scene(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    scene_number: int
    script: str                           # spoken text
    duration: int = 8                     # seconds
    avatar_position: Literal["left", "right", "center", "none"] = "left"
    background_prompt: str = ""
    background_image_url: str | None = None
    broll_images: list[str] = Field(default_factory=list)
    text_overlays: list[dict[str, Any]] = Field(default_factory=list)
    transition: str = "cut"
    status: str = "planned"               # planned|rendering|done|failed
    video_url: str | None = None


class GateRequest(BaseModel):
    gate: Literal["G1", "G2", "G3", "G4", "G5", "AD-HOC"]
    requested_by: str = "GSD"
    reason: str = ""
    evidence: dict[str, Any] = Field(default_factory=dict)


class RunManifest(BaseModel):
    """In-memory representation of a YuteStudio run.

    A run is a single video walking the 8-stage pipeline. Persisted across
    three MoltBot tables (video_projects, video_scenes, yute_run_meta).
    """
    model_config = ConfigDict(use_enum_values=True)

    # Identity
    project_id: UUID = Field(default_factory=uuid4)
    user_email: str
    title: str = ""

    # Stage-1 (PROMPT)
    original_prompt: str
    enhanced_prompt: str = ""
    questions: list[str] = Field(default_factory=list)
    answers: dict[str, str] = Field(default_factory=dict)

    # Stage-2 (RESEARCH)
    research: list[ResearchItem] = Field(default_factory=list)

    # Stage-3 (SCRIPT)
    scenes: list[Scene] = Field(default_factory=list)

    # Persona
    avatar_id: str | None = None
    voice_id: str | None = None
    voice_provider: str | None = None       # "chatterbox" | "kokoro" | "f5" | ...

    # Orchestration state (→ yute_run_meta)
    tier: Tier = Tier.FREE
    pipeline_state: PipelineState = PipelineState.IDEA
    budget_cents: int = 300
    spent_cents: int = 0
    flags: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)

    # Outputs
    thumbnail_url: str | None = None
    final_video_url: str | None = None

    # Metadata passthrough (→ video_projects.metadata jsonb)
    metadata: dict[str, Any] = Field(default_factory=dict)

    def advance(self) -> PipelineState:
        """Return the next state in the happy path (no side-effects)."""
        if self.pipeline_state in (PipelineState.FAILED, PipelineState.CANCELLED):
            return self.pipeline_state
        idx = PIPELINE_ORDER.index(PipelineState(self.pipeline_state))
        if idx + 1 >= len(PIPELINE_ORDER):
            return PipelineState(self.pipeline_state)
        return PIPELINE_ORDER[idx + 1]

    def remaining_budget_cents(self) -> int:
        return max(0, self.budget_cents - self.spent_cents)
