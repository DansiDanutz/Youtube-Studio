"""Shared repo-local environment loading."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


@lru_cache(maxsize=1)
def load_repo_env() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
