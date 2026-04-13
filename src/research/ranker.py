"""
Research ranker (Discovery).

Scores each ResearchItem on:
  - recency (published_at) — newer = higher
  - source diversity — penalize duplicate domains
  - snippet density — longer snippets = richer signal
  - keyword overlap with the enhanced_prompt

Returns top-k deduped items. Deterministic so tests are stable.
"""
from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import urlparse

from src.manifest import ResearchItem, RunManifest

log = logging.getLogger(__name__)
TOP_K = 8


def rank(items: list[ResearchItem], reference_text: str = "", *, top_k: int = TOP_K) -> list[ResearchItem]:
    ref_words = _tokens(reference_text)
    domain_count: Counter[str] = Counter()

    scored: list[tuple[float, ResearchItem]] = []
    for it in items:
        score = 0.0
        score += _recency_score(it.published_at)
        score += _density_score(it.snippet)
        score += _overlap_score(_tokens(it.title + " " + it.snippet), ref_words)
        score += _source_bonus(it.source)

        domain = _domain(it.url)
        if domain:
            penalty = 0.1 * domain_count[domain]
            score -= penalty
            domain_count[domain] += 1

        scored.append((score, it.model_copy(update={"score": round(score, 4)})))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [it for _, it in scored[:top_k]]


# -------- scoring helpers --------
def _recency_score(dt: datetime | None) -> float:
    if dt is None:
        return 0.0
    days = max(0, (datetime.now(timezone.utc) - dt).days)
    if days < 30:
        return 0.4
    if days < 180:
        return 0.2
    if days < 365:
        return 0.1
    return 0.0


def _density_score(snippet: str) -> float:
    n = len(snippet or "")
    if n >= 400:
        return 0.3
    if n >= 150:
        return 0.2
    if n >= 50:
        return 0.1
    return 0.0


def _overlap_score(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return min(0.5, 0.05 * inter)


def _source_bonus(source: str) -> float:
    return {"youtube-transcript": 0.3, "serpapi": 0.1}.get(source, 0.0)


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-zA-Z]{3,}", (text or "").lower())}


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


# -------- dispatcher entrypoint --------
def run(manifest: RunManifest) -> RunManifest:
    ranked = rank(manifest.research, reference_text=manifest.enhanced_prompt)
    manifest.research = ranked
    try:
        from src.orchestrator.db import T_PROJECTS, get_client

        get_client().table(T_PROJECTS).update(
            {
                "metadata": {
                    **(manifest.metadata or {}),
                    "research": [i.model_dump(mode="json") for i in ranked],
                }
            }
        ).eq("id", str(manifest.project_id)).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("persist rank failed: %s", exc)
    return manifest
