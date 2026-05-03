import {
  type Brief,
  type Script,
  type ScriptDraft,
  type ScriptScene,
  DomainError
} from "../../../../packages/domain/src/index.js";
import { type StructuredOutputRequester } from "../openai.js";

const scriptDraftSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    narrationTargetSeconds: {
      type: "number",
      minimum: 45,
      maximum: 60
    },
    lines: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: ["hook", "beat", "payoff"]
          },
          text: { type: "string", minLength: 1 },
          factIds: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 }
          }
        },
        required: ["section", "text", "factIds"],
        additionalProperties: false
      }
    }
  },
  required: ["title", "narrationTargetSeconds", "lines"],
  additionalProperties: false
} as const;

export function generateScript(brief: Brief): Script {
  return buildScriptFromDraft(buildDeterministicScriptDraft(brief), brief);
}

export async function generateScriptWithProvider(
  brief: Brief,
  args: {
    model: string;
    requestStructuredOutput: StructuredOutputRequester;
  }
): Promise<Script> {
  const draft = await args.requestStructuredOutput<ScriptDraft>({
    model: args.model,
    name: "youtube_short_script",
    schema: scriptDraftSchema,
    instructions: [
      "You write source-grounded scripts for a 45 to 60 second faceless educational YouTube Short.",
      "Produce exactly 5 lines in this order: one hook, three beats, one payoff.",
      "Each line must cite only fact ids that exist in the provided fact pack.",
      "Do not invent new facts, new fact ids, or unsupported aerodynamic explanations.",
      "Respect banned claims and keep the tone calm, precise, and confidence-building."
    ].join(" "),
    input: {
      brief,
      outputRequirements: {
        lineCount: 5,
        sections: ["hook", "beat", "beat", "beat", "payoff"]
      }
    }
  });

  return buildScriptFromDraft(draft, brief);
}

export function verifyScriptGrounding(script: Script, brief: Brief): void {
  const validFactIds = new Set(brief.factPack.map((item) => item.id));

  for (const claim of script.claims) {
    if (claim.factIds.length === 0) {
      throw new DomainError("SCRIPT_FACT_COVERAGE_FAILED", `Line ${claim.lineIndex + 1} is missing fact support.`);
    }

    for (const factId of claim.factIds) {
      if (!factId.trim() || !validFactIds.has(factId)) {
        throw new DomainError(
          "SCRIPT_FACT_COVERAGE_FAILED",
          `Line ${claim.lineIndex + 1} references unknown fact id "${factId}".`
        );
      }
    }
  }
}

function buildDeterministicScriptDraft(brief: Brief): ScriptDraft {
  const supportingFacts = brief.factPack.slice(0, 3);
  const hookFact = supportingFacts[0] ?? brief.factPack[0];
  const payoffFact = brief.factPack[brief.factPack.length - 1];

  return {
    title: brief.topic,
    narrationTargetSeconds: 50,
    lines: [
      {
        section: "hook",
        text: "One engine quits, and the plane still keeps flying. That is a design requirement, not a miracle.",
        factIds: [hookFact.id]
      },
      ...supportingFacts.map((fact, index) => ({
        section: "beat" as const,
        text:
          index === 0
            ? "Commercial twins are certified to keep flying and land safely after a single engine failure."
            : index === 1
              ? "Pilots rehearse the engine-out checklist in simulators, so the response is procedural instead of improvised."
              : "The remaining engine still pushes forward while the wings keep making lift, so the airplane stays controllable.",
        factIds: [fact.id]
      })),
      {
        section: "payoff",
        text: "That is why long flights are planned around alternate airports and one-engine performance from the start.",
        factIds: [payoffFact.id]
      }
    ]
  };
}

function buildScriptFromDraft(draft: ScriptDraft, brief: Brief): Script {
  const normalizedLines = draft.lines.map((line) => ({
    section: line.section,
    text: line.text.trim(),
    factIds: line.factIds.map((factId) => factId.trim())
  }));

  const claims = normalizedLines.map((line, lineIndex) => ({
    lineIndex,
    text: line.text,
    factIds: line.factIds
  }));

  const script: Script = {
    title: draft.title.trim(),
    narrationTargetSeconds: draft.narrationTargetSeconds,
    lines: normalizedLines,
    claims,
    scenes: buildScenes(normalizedLines, brief)
  };

  verifyScriptGrounding(script, brief);
  return script;
}

function buildScenes(lines: ScriptDraft["lines"], brief: Brief): ScriptScene[] {
  return lines.map((line, lineIndex) => ({
    id: `scene-${lineIndex + 1}`,
    lineIndex,
    section: line.section,
    narration: line.text,
    visualPrompt: buildVisualPrompt(line.text, line.section, lineIndex, brief),
    factIds: [...line.factIds]
  }));
}

function buildVisualPrompt(
  narration: string,
  section: ScriptScene["section"],
  lineIndex: number,
  brief: Brief
): string {
  const basePrompt =
    section === "hook"
      ? `Opening visual for "${brief.topic}" in the ${brief.stylePreset} style.`
      : section === "payoff"
        ? `Closing visual reinforcing "${brief.desiredTakeaway}" in the ${brief.stylePreset} style.`
        : `Visual beat ${lineIndex} for "${brief.topic}" in the ${brief.stylePreset} style.`;

  return `${basePrompt} Narration beat: ${narration}`;
}
