import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface LoadLocalEnvOptions {
  optional?: boolean;
}

export function loadLocalEnv(rootDir: string, options: LoadLocalEnvOptions = {}): void {
  for (const name of [".env.local", ".env"]) {
    const path = join(rootDir, name);
    if (!existsSync(path)) {
      continue;
    }

    try {
      applyEnvFile(readFileSync(path, "utf8"));
    } catch (error) {
      if (!options.optional) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "unknown read error";
      console.warn(`Skipping optional env file ${name}: ${message}`);
    }
  }
}

function applyEnvFile(text: string): void {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    process.env[key] = stripQuotes(rawValue);
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
