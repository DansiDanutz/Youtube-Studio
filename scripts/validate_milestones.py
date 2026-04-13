#!/usr/bin/env python3
"""Validate every config/milestones/*.yaml loads and has the required keys."""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

REQUIRED = {"id", "title", "week_target", "budget_cents", "tasks"}


def main() -> int:
    root = Path(__file__).resolve().parents[1] / "config" / "milestones"
    errors: list[str] = []
    for path in sorted(root.glob("M*.yaml")):
        try:
            data = yaml.safe_load(path.read_text())
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{path.name}: YAML error — {exc}")
            continue
        missing = REQUIRED - data.keys()
        if missing:
            errors.append(f"{path.name}: missing keys {sorted(missing)}")
        if not isinstance(data.get("tasks"), list) or not data["tasks"]:
            errors.append(f"{path.name}: tasks must be a non-empty list")

    if errors:
        print("MILESTONE VALIDATION FAILED:", file=sys.stderr)
        for e in errors:
            print("  - " + e, file=sys.stderr)
        return 1
    print(f"ok: validated {sum(1 for _ in root.glob('M*.yaml'))} milestone files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
