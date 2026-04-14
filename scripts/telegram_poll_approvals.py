#!/usr/bin/env python3
"""
telegram_poll_approvals.py

Alternative to the public Telegram webhook. Polls Bot API updates directly and
applies `/approve <id>` or `/reject <id> <reason>` decisions through the same
approval bridge used by the FastAPI endpoint.

Useful when:
- the bot token exists
- the target chat has started the bot
- FastAPI is not publicly deployed yet
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

from src.orchestrator import approval_bridge

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)

TOKEN = approval_bridge.TG_BOT_TOKEN
CHAT_ID = approval_bridge.TG_CHAT_ID
API_BASE = f"https://api.telegram.org/bot{TOKEN}"
OFFSET_FILE = ROOT / ".telegram_poll_offset"


def load_offset() -> int | None:
    if not OFFSET_FILE.exists():
        return None
    try:
        return int(OFFSET_FILE.read_text().strip())
    except Exception:
        return None


def save_offset(offset: int) -> None:
    OFFSET_FILE.write_text(str(offset))


def fetch_updates(timeout: int = 10) -> list[dict]:
    if not TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN missing")
    params: dict[str, object] = {"timeout": timeout}
    offset = load_offset()
    if offset is not None:
        params["offset"] = offset
    with httpx.Client(timeout=timeout + 5) as client:
        resp = client.get(f"{API_BASE}/getUpdates", params=params)
        resp.raise_for_status()
        data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"Telegram getUpdates failed: {data}")
    return data.get("result", [])


def handle_message(message: dict) -> str | None:
    chat = message.get("chat") or {}
    text = str(message.get("text") or "").strip()
    if not text:
        return None
    if CHAT_ID and str(chat.get("id")) != str(CHAT_ID):
        return None
    parts = text.split(maxsplit=2)
    if len(parts) < 2:
        return None
    cmd = parts[0].lstrip("/").lower()
    if cmd not in {"approve", "reject"}:
        return None
    try:
        approval_id = int(parts[1])
    except ValueError:
        return None
    reason = parts[2] if len(parts) == 3 else ""
    user = str((message.get("from") or {}).get("username") or "telegram-user")
    decision = "approved" if cmd == "approve" else "rejected"
    approval_bridge.decide(approval_id, decision=decision, approver=user, reason=reason)
    return f"{decision}:{approval_id}"


def run_once() -> list[str]:
    updates = fetch_updates(timeout=1)
    actions: list[str] = []
    latest_offset: int | None = None
    for update in updates:
        latest_offset = int(update["update_id"]) + 1
        message = update.get("message") or {}
        action = handle_message(message)
        if action:
            actions.append(action)
    if latest_offset is not None:
        save_offset(latest_offset)
    return actions


def run_forever(interval: int) -> None:
    while True:
        actions = run_once()
        if actions:
            print(json.dumps({"processed": actions}, ensure_ascii=False))
        time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process pending updates once and exit")
    parser.add_argument("--interval", type=int, default=5, help="Polling interval in seconds")
    args = parser.parse_args()

    if args.once:
        actions = run_once()
        print(json.dumps({"processed": actions}, ensure_ascii=False))
        return 0

    run_forever(args.interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
