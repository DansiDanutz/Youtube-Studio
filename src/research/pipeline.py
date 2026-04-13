"""Chained RESEARCH stage — scrape then rank, one dispatcher entrypoint."""
from src.manifest import RunManifest

from .ranker import run as rank_run
from .scraper import run as scrape_run


def run(manifest: RunManifest) -> RunManifest:
    manifest = scrape_run(manifest)
    manifest = rank_run(manifest)
    return manifest
