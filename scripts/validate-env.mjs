import process from "node:process";

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
