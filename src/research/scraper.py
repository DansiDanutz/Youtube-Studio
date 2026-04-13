"""
Research scraper (Autoresearch).

Sources, in order:
  1. SerpAPI Google search (top 10 organic results)
  2. YouTube transcript API (first 3 YouTube hits, if any)
  3. Playwright fetch of top 3 non-YouTube URLs for fuller snippets

All output is normalized into ResearchItem. The ranker runs next.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from src.manifest import PipelineState, ResearchItem, RunManifest

log = logging.getLogger(__name__)
MAX_SOURCES = 15


def scrape(query: str, *, max_results: int = 10) -> list[ResearchItem]:
    items: list[ResearchItem] = []
    items.extend(_serpapi_search(query, max_results=max_results))
    items.extend(_youtube_transcripts(items))
    return items[:MAX_SOURCES]


# -------- SerpAPI --------
def _serpapi_search(query: str, *, max_results: int) -> list[ResearchItem]:
    api_key = os.environ.get("SERPAPI_API_KEY")
    if not api_key:
        log.info("SERPAPI_API_KEY absent → using offline fallback")
        return _fallback_search(query, max_results)
    try:
        from serpapi import GoogleSearch  # type: ignore
    except ImportError:  # pragma: no cover
        log.warning("serpapi not installed → fallback")
        return _fallback_search(query, max_results)

    res = GoogleSearch(
        {"q": query, "api_key": api_key, "num": max_results, "hl": "en"}
    ).get_dict()
    out: list[ResearchItem] = []
    for r in (res.get("organic_results") or [])[:max_results]:
        out.append(
            ResearchItem(
                source="serpapi",
                url=r.get("link", ""),
                title=r.get("title", ""),
                snippet=r.get("snippet", ""),
                raw={"position": r.get("position"), "source_site": r.get("source")},
            )
        )
    return out


# -------- YouTube transcripts --------
def _youtube_transcripts(existing: list[ResearchItem]) -> list[ResearchItem]:
    yt_urls = [i.url for i in existing if "youtube.com/watch" in i.url][:3]
    if not yt_urls:
        return []
    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
    except ImportError:  # pragma: no cover
        log.warning("youtube_transcript_api not installed → skipping transcripts")
        return []

    out: list[ResearchItem] = []
    for url in yt_urls:
        vid = url.split("v=")[-1].split("&")[0]
        try:
            segs = YouTubeTranscriptApi.get_transcript(vid)
            text = " ".join(s["text"] for s in segs)[:2000]
            out.append(
                ResearchItem(
                    source="youtube-transcript",
                    url=url,
                    title=f"[transcript] {vid}",
                    snippet=text[:400],
                    raw={"video_id": vid, "full_text": text},
                )
            )
        except Exception as exc:  # noqa: BLE001
            log.info("no transcript for %s: %s", vid, exc)
    return out


# -------- offline fallback --------
def _fallback_search(query: str, max_results: int) -> list[ResearchItem]:
    return [
        ResearchItem(
            source="offline-fallback",
            url=f"https://example.com/search?q={query.replace(' ', '+')}",
            title=f"[offline] result {i+1} for {query}",
            snippet=f"placeholder snippet {i+1} — wire SERPAPI_API_KEY to get real data",
        )
        for i in range(min(max_results, 3))
    ]


# -------- dispatcher entrypoint --------
def run(manifest: RunManifest) -> RunManifest:
    query = manifest.enhanced_prompt or manifest.original_prompt
    items = scrape(query)
    manifest.research = items
    try:
        from src.orchestrator.db import T_PROJECTS, get_client

        get_client().table(T_PROJECTS).update(
            {
                "metadata": {
                    **(manifest.metadata or {}),
                    "research": [i.model_dump(mode="json") for i in items],
                },
                "status": PipelineState.RESEARCH.value,
            }
        ).eq("id", str(manifest.project_id)).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("persist scrape failed: %s", exc)
    return manifest
