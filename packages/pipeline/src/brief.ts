import { type Brief, type BriefInput, type FactPackItem, DomainError } from "../../../packages/domain/src/index.js";
import { type StructuredOutputRequester } from "./openai.js";

const normalizedBriefSchema = {
  type: "object",
  properties: {
    topic: { type: "string", minLength: 1 },
    audience: { type: "string", minLength: 1 },
    desiredTakeaway: { type: "string", minLength: 1 },
    stylePreset: { type: "string", minLength: 1 },
    factPack: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          claim: { type: "string", minLength: 1 },
          source: { type: "string", minLength: 1 }
        },
        required: ["id", "claim", "source"],
        additionalProperties: false
      }
    },
    sourceNotes: {
      type: "array",
      items: { type: "string" }
    },
    bannedClaims: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["topic", "audience", "desiredTakeaway", "stylePreset", "factPack", "sourceNotes", "bannedClaims"],
  additionalProperties: false
} as const;

export function normalizeBrief(input: BriefInput): Brief {
  return {
    ...input,
    topic: input.topic.trim(),
    audience: input.audience.trim(),
    desiredTakeaway: input.desiredTakeaway.trim(),
    stylePreset: input.stylePreset.trim(),
    factPack: input.factPack.map(normalizeFactPackItem),
    sourceNotes: (input.sourceNotes ?? []).map((note) => note.trim()).filter(Boolean),
    bannedClaims: (input.bannedClaims ?? []).map((claim) => claim.trim()).filter(Boolean),
    platformPreset: "youtube_shorts_vertical"
  };
}

export function validateBrief(brief: Brief): void {
  if (!brief.topic) {
    throw new DomainError("BRIEF_TOPIC_MISSING", "Brief topic is required.");
  }

  if (brief.factPack.length === 0) {
    throw new DomainError("BRIEF_FACT_PACK_MISSING", "Brief fact pack must contain at least one fact.");
  }

  if (!brief.stylePreset) {
    throw new DomainError("BRIEF_STYLE_PRESET_MISSING", "Brief style preset is required.");
  }
}

export async function normalizeBriefWithProvider(
  input: BriefInput,
  args: {
    model: string;
    requestStructuredOutput: StructuredOutputRequester;
  }
): Promise<Brief> {
  const normalized = await args.requestStructuredOutput<BriefInput>({
    model: args.model,
    name: "normalized_brief",
    schema: normalizedBriefSchema,
    instructions: [
      "You normalize approved briefs for a YouTube Shorts automation pipeline.",
      "Return the same fields as the input schema.",
      "Preserve every fact-pack item and keep fact ids exact.",
      "Do not invent claims, sources, notes, or banned claims.",
      "Trim wording for clarity while keeping the factual meaning unchanged."
    ].join(" "),
    input
  });

  return normalizeBrief(normalized);
}

function normalizeFactPackItem(item: FactPackItem): FactPackItem {
  return {
    id: item.id.trim(),
    claim: item.claim.trim(),
    source: item.source.trim()
  };
}
