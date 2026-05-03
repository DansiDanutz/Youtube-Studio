import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

loadLocalEnv(process.cwd());

const checks = [
  { name: "OPENAI_API_KEY", requiredFor: "provider-backed brief/script generation" },
  { name: "OPENAI_MODEL", requiredFor: "optional override for the OpenAI script model" },
  { name: "ELEVENLABS_API_KEY", requiredFor: "provider-backed narration generation" }
];

console.log("Environment check");
console.log("");
console.log(`Node ${process.version}`);
console.log(`pnpm scripts assume the local TypeScript toolchain is installed via pnpm.`);
console.log("");

for (const check of checks) {
  const present = Boolean(process.env[check.name]);
  const status = present ? "present" : "missing";
  console.log(`- ${check.name}: ${status} (${check.requiredFor})`);
}

console.log("");
console.log("The default smoke lane is deterministic and can run without external provider secrets.");
console.log("Use `--mode provider` to exercise the OpenAI-backed brief and script lane.");

function loadLocalEnv(rootDir) {
  for (const name of [".env.local", ".env"]) {
    const path = join(rootDir, name);
    if (!existsSync(path)) continue;
    applyEnvFile(readFileSync(path, "utf8"));
  }
}

function applyEnvFile(text) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;
    const rawValue = line.slice(separatorIndex + 1).trim();
    process.env[key] = stripQuotes(rawValue);
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
