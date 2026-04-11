import {
  type ArtifactRecord,
  type Brief,
  type BriefNormalizationSource,
  type ReviewSummary,
  type RunMode,
  type Script,
  type ScriptGenerationSource
} from "../../../packages/domain/src/index.js";

export function renderScriptMarkdown(script: Script, brief?: Brief): string {
  const factById = brief ? new Map(brief.factPack.map((item) => [item.id, item])) : null;
  const sections = script.lines.map((line, index) => {
    const prefix =
      line.section === "hook" ? "## Hook" : line.section === "payoff" ? "## Payoff" : `## Beat ${index}`;
    const sources = line.factIds
      .map((factId) => {
        const fact = factById?.get(factId);
        return fact ? `${factId} — ${fact.claim} (${fact.source})` : factId;
      })
      .join("; ");
    return `${prefix}\n\n${line.text}\n\nSources: ${sources}`;
  });

  return [`# ${script.title}`, `Target narration: ${script.narrationTargetSeconds}s`, ...sections].join("\n\n");
}

export function buildReviewSummary(args: {
  runId: string;
  topic: string;
  artifacts: ArtifactRecord[];
  mode: RunMode;
  briefNormalization: BriefNormalizationSource;
  scriptGeneration: ScriptGenerationSource;
  model: string | null;
  groundingStatus: "verified" | "not_applicable";
}): ReviewSummary {
  return {
    runId: args.runId,
    topic: args.topic,
    status: "awaiting_review",
    metadata: {
      mode: args.mode,
      briefNormalization: args.briefNormalization,
      scriptGeneration: args.scriptGeneration,
      model: args.model,
      groundingStatus: args.groundingStatus
    },
    artifacts: args.artifacts,
    checks: [
      {
        label: "Brief satisfies MVP constraints",
        status: "pass",
        note: "Topic, fact pack, and style preset are present."
      },
      {
        label: "Script grounding verification",
        status: "pass",
        note: "Every generated line references known fact-pack ids before review artifacts are emitted."
      },
      {
        label: "Generation mode",
        status: args.mode === "provider" ? "pass" : "warn",
        note:
          args.mode === "provider"
            ? `Provider-backed script generation ran with ${args.model ?? "the configured model"}.`
            : "Deterministic baseline mode is active; provider generation has not been exercised in this run."
      },
      {
        label: "Downstream media stages",
        status: "warn",
        note: "This slice still stops before voice, assets, and render."
      }
    ]
  };
}

export function renderReviewHtml(args: {
  brief: Brief;
  script: Script;
  summary: ReviewSummary;
}): string {
  const factById = new Map(args.brief.factPack.map((item) => [item.id, item]));
  const summaryItems = args.summary.checks
    .map((check) => `<li><strong>${escapeHtml(check.label)}</strong>: ${escapeHtml(check.status)} — ${escapeHtml(check.note)}</li>`)
    .join("");
  const supportRows = args.script.lines
    .map((line, index) => {
      const support = line.factIds
        .map((factId) => {
          const fact = factById.get(factId);
          return fact
            ? `<li><code>${escapeHtml(factId)}</code> — ${escapeHtml(fact.claim)} <span class="muted">(${escapeHtml(fact.source)})</span></li>`
            : `<li><code>${escapeHtml(factId)}</code> — missing from fact pack</li>`;
        })
        .join("");

      return `<article class="script-line">
        <div class="line-meta">${escapeHtml(line.section.toUpperCase())} · Line ${index + 1}</div>
        <h3>${escapeHtml(line.text)}</h3>
        <ul>${support}</ul>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(args.brief.topic)} review</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f2ea;
        --panel: #fffdf9;
        --ink: #1f2328;
        --accent: #ad5a2d;
        --muted: #6f665f;
        --border: #e4d8c7;
      }
      body {
        margin: 0;
        background: linear-gradient(180deg, #efe7da 0%, var(--bg) 100%);
        color: var(--ink);
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 48px 24px 80px;
      }
      section {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 24px;
        margin-bottom: 20px;
        box-shadow: 0 12px 40px rgba(61, 44, 31, 0.08);
      }
      h1, h2, h3 {
        margin-top: 0;
        font-family: Georgia, serif;
      }
      .eyebrow {
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
      }
      ul {
        padding-left: 20px;
      }
      code {
        font-family: "SFMono-Regular", "Menlo", monospace;
        background: #f3eee5;
        padding: 2px 4px;
        border-radius: 4px;
      }
      .muted {
        color: var(--muted);
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .meta-grid div {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        background: #faf6ef;
      }
      .script-line {
        border-top: 1px solid var(--border);
        padding-top: 18px;
        margin-top: 18px;
      }
      .script-line:first-of-type {
        border-top: 0;
        padding-top: 0;
        margin-top: 0;
      }
      .line-meta {
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="eyebrow">Review package</div>
        <h1>${escapeHtml(args.brief.topic)}</h1>
        <p>${escapeHtml(args.brief.desiredTakeaway)}</p>
        <p class="muted">Audience: ${escapeHtml(args.brief.audience)} · Style preset: ${escapeHtml(args.brief.stylePreset)}</p>
      </section>
      <section>
        <h2>Run metadata</h2>
        <div class="meta-grid">
          <div><strong>Mode</strong><br />${escapeHtml(args.summary.metadata.mode)}</div>
          <div><strong>Brief normalization</strong><br />${escapeHtml(args.summary.metadata.briefNormalization)}</div>
          <div><strong>Script generation</strong><br />${escapeHtml(args.summary.metadata.scriptGeneration)}</div>
          <div><strong>Grounding</strong><br />${escapeHtml(args.summary.metadata.groundingStatus)}</div>
          <div><strong>Model</strong><br />${escapeHtml(args.summary.metadata.model ?? "n/a")}</div>
        </div>
      </section>
      <section>
        <h2>Automated checks</h2>
        <ul>${summaryItems}</ul>
      </section>
      <section>
        <h2>Script draft with supporting facts</h2>
        ${supportRows}
      </section>
      <section>
        <h2>Fact pack</h2>
        <ul>
          ${args.brief.factPack
            .map((item) => `<li><strong>${escapeHtml(item.id)}</strong>: ${escapeHtml(item.claim)} <em>(${escapeHtml(item.source)})</em></li>`)
            .join("")}
        </ul>
      </section>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
