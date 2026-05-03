import { join } from "node:path";
import type { VideoPipelineArtifactContract } from "./schemas.js";
import { STAGE_DEFINITIONS } from "./stages.js";

export function createArtifactContract(outputDir: string): VideoPipelineArtifactContract {
  const requiredDirectories = [
    "contract",
    "research",
    "strategy",
    "script",
    "style",
    "storyboard",
    "routing",
    "assets",
    "audio",
    "subtitles",
    "clips",
    "edit",
    "render",
    "qa",
    "package",
    "learning",
    "release"
  ];
  const requiredFiles = unique([
    "pipeline-manifest.json",
    "qa/gate-report.json",
    ...STAGE_DEFINITIONS.flatMap((stage) => stage.requiredArtifacts)
  ]);
  return {
    outputDir,
    requiredDirectories,
    requiredFiles,
    optionalFiles: [
      "render/shorts-vertical.mp4",
      "render/youtube-landscape.mp4",
      "render/thumbnail.png",
      "assets/reference-frames.json",
      "qa/operator-approval.json"
    ],
    finalVideoPath: join(outputDir, "render", "final.mp4")
  };
}

export function validateRequiredArtifacts(existingRelativePaths: string[], contract: VideoPipelineArtifactContract): string[] {
  const existing = new Set(existingRelativePaths.map((path) => path.replace(/^\/+/, "")));
  return contract.requiredFiles.filter((file) => !existing.has(file));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
