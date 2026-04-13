"""
M1 smoke test — offline end-to-end: prompt → enhance → scrape → rank → script.

Runs entirely without network (no ANTHROPIC_API_KEY, no SERPAPI_API_KEY) and
without the DB (each module's run() guards its own persistence). If this
passes, the M1 code graph is wired correctly.
"""
from __future__ import annotations

from src.manifest import PipelineState, RunManifest, Tier
from src.prompt_engine.enhancer import enhance
from src.research.ranker import rank
from src.research.scraper import scrape
from src.script.generator import generate_script


def test_end_to_end_offline() -> None:
    # 1. Prompt
    original = "How do LLM agents plan multi-step tasks?"
    enhanced = enhance(original)
    assert enhanced.enhanced_prompt, "enhancer returned empty prompt"
    assert 3 <= len(enhanced.questions) <= 5, enhanced.questions

    # 2. Research
    items = scrape(enhanced.enhanced_prompt, max_results=5)
    assert items, "scraper returned nothing (fallback should always return >=3)"

    # 3. Rank
    ranked = rank(items, reference_text=enhanced.enhanced_prompt, top_k=5)
    assert ranked, "ranker dropped everything"
    assert all(r.score >= 0 for r in ranked), "negative scores after rank"

    # 4. Script
    title, scenes = generate_script(enhanced.enhanced_prompt, ranked)
    assert title
    assert 5 <= len(scenes) <= 12, f"unexpected scene count: {len(scenes)}"
    for s in scenes:
        assert s.script, f"scene {s.scene_number} has empty script"
        assert s.duration > 0


def test_manifest_advance() -> None:
    m = RunManifest(
        user_email="test@example.com",
        original_prompt="hello world",
        tier=Tier.FREE,
    )
    assert PipelineState(m.pipeline_state) == PipelineState.IDEA
    assert m.advance() == PipelineState.PROMPT
    m.pipeline_state = PipelineState.PUBLISH
    assert m.advance() == PipelineState.PUBLISH  # terminal
    m.pipeline_state = PipelineState.CANCELLED
    assert m.advance() == PipelineState.CANCELLED


def test_ranker_dedup_by_domain() -> None:
    from src.manifest import ResearchItem

    items = [
        ResearchItem(source="serpapi", url="https://a.com/1", title="A1", snippet="x" * 400),
        ResearchItem(source="serpapi", url="https://a.com/2", title="A2", snippet="x" * 400),
        ResearchItem(source="serpapi", url="https://b.com/1", title="B1", snippet="x" * 400),
    ]
    ranked = rank(items, top_k=3)
    # Domain penalty should push b.com up relative to the second a.com result
    assert ranked[0].url.startswith("https://a.com")
    assert ranked[1].url == "https://b.com/1"
