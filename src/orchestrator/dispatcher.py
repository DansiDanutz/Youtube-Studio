"""
Dispatcher — maps a RunManifest's current pipeline_state to the module that
advances it by one stage. Each stage module must expose `run(manifest) -> manifest`.
"""
from __future__ import annotations

import importlib
import logging
from typing import Callable

from src.manifest import PipelineState, RunManifest

log = logging.getLogger(__name__)


STAGE_MODULES: dict[PipelineState, str] = {
    PipelineState.IDEA:     "src.orchestrator.stages.s0_idea",
    PipelineState.PROMPT:   "src.prompt_engine.enhancer",
    PipelineState.RESEARCH: "src.research.pipeline",
    PipelineState.SCRIPT:   "src.script.generator",
    PipelineState.RENDER:   "src.video.render_pipeline",
    PipelineState.REVIEW:   "src.orchestrator.stages.s5_review",
    PipelineState.MERGE:    "src.video.composer",
    PipelineState.PUBLISH:  "src.publish.youtube_uploader",
}


def advance(manifest: RunManifest) -> RunManifest:
    """Walk the manifest one stage forward. No-op for terminal states."""
    state = PipelineState(manifest.pipeline_state)
    if state in (PipelineState.FAILED, PipelineState.CANCELLED, PipelineState.PUBLISH):
        return manifest

    module_path = STAGE_MODULES[state]
    log.info("dispatch %s → %s", manifest.project_id, module_path)
    try:
        mod = importlib.import_module(module_path)
    except ModuleNotFoundError:
        log.warning("stage module not implemented yet: %s", module_path)
        return manifest

    run_fn: Callable[[RunManifest], RunManifest] | None = getattr(mod, "run", None)
    if run_fn is None:
        log.warning("%s missing run(manifest) entrypoint", module_path)
        return manifest

    result = run_fn(manifest)
    next_state = result.advance()
    result.pipeline_state = next_state
    return result
