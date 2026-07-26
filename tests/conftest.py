from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def isolate_external_provider_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep the offline suite deterministic on operator workstations."""
    for name in ("ANTHROPIC_API_KEY", "SERPAPI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
