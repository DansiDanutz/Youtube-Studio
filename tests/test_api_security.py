from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.api import main

client = TestClient(main.app)


def test_mutation_rejects_missing_api_configuration(monkeypatch) -> None:
    monkeypatch.delenv("YUTE_API_TOKEN", raising=False)
    monkeypatch.setattr(main, "gsd_tick", lambda: {"unexpected": True})

    response = client.post("/gsd/tick")

    assert response.status_code == 503
    assert response.json() == {"detail": "API authentication is not configured"}


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        (
            "POST",
            "/runs",
            {"user_email": "operator@example.com", "original_prompt": "test"},
        ),
        ("GET", "/runs/123e4567-e89b-12d3-a456-426614174000", None),
        ("POST", "/runs/123e4567-e89b-12d3-a456-426614174000/advance", None),
        ("POST", "/runs/123e4567-e89b-12d3-a456-426614174000/cancel", None),
        (
            "POST",
            "/approvals/42/decide",
            {"decision": "approved", "approver": "operator"},
        ),
        ("GET", "/milestones", None),
        ("POST", "/gsd/tick", None),
    ],
)
def test_operational_routes_reject_invalid_bearer_token(
    monkeypatch, method, path, payload
) -> None:
    monkeypatch.setenv("YUTE_API_TOKEN", "correct-secret")

    response = client.request(
        method,
        path,
        headers={"Authorization": "Bearer wrong-secret"},
        json=payload,
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "invalid bearer token"}


def test_mutation_accepts_valid_bearer_token(monkeypatch) -> None:
    monkeypatch.setenv("YUTE_API_TOKEN", "correct-secret")
    monkeypatch.setattr(main, "gsd_tick", lambda: {"ran": True})

    response = client.post(
        "/gsd/tick",
        headers={"Authorization": "Bearer correct-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {"ran": True}


def test_telegram_webhook_rejects_forged_approval(monkeypatch) -> None:
    decisions: list[tuple] = []
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "telegram-secret")
    monkeypatch.setattr(main.approval_bridge, "decide", lambda *args, **kwargs: decisions.append((args, kwargs)))

    response = client.post(
        "/telegram/webhook",
        json={"message": {"text": "/approve 42", "from": {"username": "attacker"}}},
    )

    assert response.status_code == 401
    assert decisions == []


def test_telegram_webhook_accepts_configured_secret(monkeypatch) -> None:
    decisions: list[tuple] = []
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "telegram-secret")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "12345")
    monkeypatch.setattr(main.approval_bridge, "decide", lambda *args, **kwargs: decisions.append((args, kwargs)))

    response = client.post(
        "/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": "telegram-secret"},
        json={"message": {"chat": {"id": 12345}, "text": "/approve 42", "from": {"username": "operator"}}},
    )

    assert response.status_code == 200
    assert decisions == [((42,), {"decision": "approved", "approver": "operator", "reason": ""})]


def test_telegram_webhook_rejects_other_chat_with_valid_transport_secret(monkeypatch) -> None:
    decisions: list[tuple] = []
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "telegram-secret")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "12345")
    monkeypatch.setattr(main.approval_bridge, "decide", lambda *args, **kwargs: decisions.append((args, kwargs)))

    response = client.post(
        "/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": "telegram-secret"},
        json={"message": {"chat": {"id": 99999}, "text": "/approve 42", "from": {"username": "attacker"}}},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Telegram chat is not authorized"}
    assert decisions == []


def test_health_does_not_expose_provider_exception(monkeypatch) -> None:
    def fail_with_internal_detail():
        raise RuntimeError("database-host.internal:5432 credential rejected")

    monkeypatch.setattr(main, "get_client", fail_with_internal_detail)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"ok": False, "db": "down"}
    assert "database-host" not in response.text
