import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../../../fixtures/topics/airplanes-one-engine-research-approved.json" with { type: "json" };
import {
  generateScript,
  generateScriptWithProvider,
  normalizeBrief,
  normalizeBriefWithProvider,
  renderScriptMarkdown,
  validateBrief,
  verifyScriptGrounding
} from "./index.js";

test("generateScript maps every line to fact ids", () => {
  const brief = normalizeBrief(fixture);
  validateBrief(brief);
  const script = generateScript(brief);

  assert.equal(script.lines.length, 5);
  assert.equal(script.scenes.length, script.lines.length);
  assert.ok(script.claims.every((claim) => claim.factIds.length > 0));
  assert.equal(script.scenes[0]?.id, "scene-1");
  assert.match(script.scenes[0]?.visualPrompt ?? "", /Opening visual/);
  assert.deepEqual(script.scenes[0]?.factIds, script.lines[0]?.factIds);
  assert.match(renderScriptMarkdown(script), /Sources: fact-1/);
});

test("normalizeBriefWithProvider returns normalized provider output", async () => {
  const brief = await normalizeBriefWithProvider(fixture, {
    model: "gpt-5.4-mini",
    requestStructuredOutput: async <T>() =>
      ({
        ...fixture,
        topic: "  Why airplanes can fly with one engine  ",
        sourceNotes: ["  Keep the explanation calm and confidence-building.  "],
        bannedClaims: ["  Any statement that all engine failures are harmless.  "]
      }) as T
  });

  assert.equal(brief.topic, "Why airplanes can fly with one engine");
  assert.deepEqual(brief.sourceNotes, ["Keep the explanation calm and confidence-building."]);
  assert.equal(brief.platformPreset, "youtube_shorts_vertical");
});

test("verifyScriptGrounding rejects unmapped fact ids", () => {
  const brief = normalizeBrief(fixture);
  const script = generateScript(brief);
  script.lines[0].factIds = ["fact-404"];
  script.claims[0].factIds = ["fact-404"];

  assert.throws(() => verifyScriptGrounding(script, brief), /unknown fact id "fact-404"/);
});

test("generateScriptWithProvider accepts mocked provider output", async () => {
  const brief = normalizeBrief(fixture);
  const script = await generateScriptWithProvider(brief, {
    model: "gpt-5.4-mini",
    requestStructuredOutput: async <T>() =>
      ({
        title: brief.topic,
        narrationTargetSeconds: 52,
        lines: [
          {
            section: "hook",
            text: "One engine can fail, and a certified airliner is still expected to keep flying safely.",
            factIds: ["fact-1"]
          },
          {
            section: "beat",
            text: "Certification rules require safe continued flight and landing after a single engine failure.",
            factIds: ["fact-1"]
          },
          {
            section: "beat",
            text: "Pilots rehearse engine-out procedures in simulators before they carry passengers.",
            factIds: ["fact-2"]
          },
          {
            section: "beat",
            text: "The remaining engine still provides thrust while the wings continue producing lift.",
            factIds: ["fact-3"]
          },
          {
            section: "payoff",
            text: "That is why route planning already accounts for one-engine diversions to alternate airports.",
            factIds: ["fact-4"]
          }
        ]
      }) as T
  });

  assert.equal(script.narrationTargetSeconds, 52);
  assert.equal(script.claims[4]?.factIds[0], "fact-4");
  assert.equal(script.scenes[4]?.section, "payoff");
  assert.match(script.scenes[4]?.visualPrompt ?? "", /Closing visual/);
});
