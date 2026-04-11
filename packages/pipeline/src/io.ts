import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${value}\n`, "utf8");
}

export function buildArtifactPaths(runRoot: string): Record<string, string> {
  return {
    brief: join(runRoot, "brief.json"),
    scriptJson: join(runRoot, "script.json"),
    scriptDraft: join(runRoot, "script_draft.md"),
    reviewScript: join(runRoot, "review", "script.md"),
    reviewHtml: join(runRoot, "review", "index.html"),
    reviewSummary: join(runRoot, "review", "review-summary.json")
  };
}
