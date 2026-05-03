# Market-Leading Hermes/OpenClaw Video Pipeline Blueprint

> For Hermes: this is the strict product/engineering baseline for the Dan's Lab prompt-to-video pipeline. The current 10-step manifest is only the first skeleton. This blueprint upgrades it into a production-grade creative system with explicit gates, tools, fallbacks, loops, and proof requirements.

Goal: turn one user prompt into an outstanding finished video with cinematic narrative, high factual accuracy, strong visuals, human narration, precise subtitles, quality scoring, artifact lineage, safe cost control, and repeatable production reliability.

Architecture: Hermes is the executive producer and quality gate. OpenClaw/David execute orchestration. Specialist lanes handle research, narrative, visual direction, ComfyUI/video generation, voice/subtitles, editing/rendering, QA, learning, and product UX. Every stage is stateful, resumable, scored, and refuses to advance without proof.

Tech stack baseline:
- Orchestration: TypeScript pipeline manifests, Paperclip issue proof, Hermes/OpenClaw, local OpenClaude executor lane, optional subagents.
- Research: Perplexity MCP/Search, local memory/skills, citation registry.
- Creative planning: structured JSON schemas, style bible, shot list, storyboard, negative prompts, brand safety checks.
- Visual generation: ComfyUI API workflows, local SDXL/Flux where available, Wan/Hunyuan/AnimateDiff-style workflow slots, ControlNet/Depth/Pose where useful, optional fal.ai only with approval.
- Audio: ElevenLabs Brian-like voice if approved, local TTS fallback, pronunciation dictionary, loudness normalization.
- Editing/rendering: Remotion + FFmpeg, SRT/VTT/ASS subtitles, multi-format exports.
- QA: LLM judge, frame sampling, audio-video sync checks, artifact existence checks, no-secret scan, cost ledger, human approval gate when needed.

---

## Non-negotiable product principles

1. Quality beats speed. A slow excellent video is better than a fast mediocre one.
2. No monolithic magic prompt. The product must decompose into strict specialist stages.
3. No stage can lock without artifacts and measurable gates.
4. Every failure must return actionable fixes, not a generic retry.
5. Local-first, but not local-only if quality requires an approved paid fallback.
6. The final product is not just an MP4. It is a production package: manifest, script, citations, assets, subtitles, audio, scene clips, final renders, QA report, and learning notes.
7. Paperclip proof is mandatory before any production-ready claim.

---

## Upgraded pipeline: 18 strict stages

### Stage 0 — Job contract and intent classification

Objective: convert the raw prompt into a production contract before creative work begins.

Inputs:
- user prompt
- desired length/aspect/language/voice/cost mode
- optional reference links/files/style examples

Outputs:
- `contract/job-contract.json`
- `contract/intent-classification.json`
- `contract/risk-and-cost-policy.json`

Tools/skills/plugins:
- Hermes decision gate
- skills lookup
- Paperclip issue context
- local policy/cost config

Enhancements:
- classify video type: explainer, ad, documentary, product demo, short, tutorial, cinematic story, social clip.
- classify audience and distribution channel: YouTube, Shorts, TikTok, X, landing page, internal demo.
- choose default aspect: 16:9, 9:16, 1:1.
- reject vague prompt or force clarification loop if the contract is too weak.

Strict gate:
- prompt specificity score >= 8/10 OR pipeline generates a stronger derived brief and labels it as an assumption.
- cost mode must be explicit.
- output folder and run ID created.

Failure loop:
- ask for missing context only if it changes the product; otherwise make explicit assumptions and proceed.

---

### Stage 1 — Research and factual grounding

Objective: gather enough truth and context to avoid hallucinated or generic video content.

Outputs:
- `research/research-brief.md`
- `research/citations.json`
- `research/fact-claims.json`
- `research/unknowns.json`

Tools/skills/plugins:
- Perplexity MCP
- web search when needed
- local memory/skills
- domain-specific specialists if topic requires it

Enhancements:
- citation registry with claim-to-source mapping.
- freshness check for current topics.
- competitor/example scan for style and structure.
- extract 3-7 high-value insights, not a long dump.

Strict gate:
- every factual claim in the planned narration has a source or is marked as opinion.
- no unsupported statistics.
- no stale source if prompt asks for current data.

Failure loop:
- re-research weak claims; remove claims that cannot be supported.

---

### Stage 2 — Creative strategy and success definition

Objective: decide what makes the video excellent before writing it.

Outputs:
- `strategy/creative-brief.json`
- `strategy/success-rubric.json`
- `strategy/hook-options.json`

Tools/skills/plugins:
- Hermes senior producer judge
- OpenClaude/OpenClaw for alternate creative angles
- design skills for art direction

Enhancements:
- define the emotional arc.
- define viewer promise in one sentence.
- generate 5 hooks and select the strongest by rubric.
- define “must remember” takeaway.
- define retention beats every 5-15 seconds.

Strict gate:
- hook score >= 8/10.
- narrative promise is clear in the first 3 seconds for short videos or first 10 seconds for long videos.
- success rubric is measurable.

Failure loop:
- regenerate hooks and strategy until strong enough.

---

### Stage 3 — Script, narration, and pacing plan

Objective: create a voice-ready script matched to duration, audience, and distribution channel.

Outputs:
- `script/script.md`
- `script/script.json`
- `script/pacing-timeline.json`
- `script/claim-map.json`

Tools/skills/plugins:
- structured LLM output
- pronunciation dictionary
- local tokenizer/duration estimator

Enhancements:
- words-per-minute estimate by voice style.
- line-level duration targets.
- rhetorical pattern selection: problem/solution, curiosity loop, documentary reveal, tutorial steps, myth-busting, etc.
- remove AI-sounding phrases.

Strict gate:
- duration estimate within ±8% before voice generation.
- no unsupported claims.
- no generic filler.
- every scene has a reason to exist.

Failure loop:
- compress/expand script automatically.
- rewrite robotic phrases.

---

### Stage 4 — Visual identity and style bible

Objective: define consistent art direction before generating assets.

Outputs:
- `style/style-bible.json`
- `style/moodboard-prompts.md`
- `style/negative-prompts.md`
- `style/reference-policy.json`

Tools/skills/plugins:
- popular-web-designs templates
- Huashu/design skill patterns
- ComfyUI style workflows
- optional reference images

Enhancements:
- choose from real design systems: ElevenLabs cinematic dark, RunwayML, Linear, Vercel, Stripe, Apple, SpaceX, etc.
- define color palette, typography, subtitle style, lower-thirds, transitions, motion grammar.
- define character/subject consistency rules.
- define forbidden visuals and common AI artifact negatives.

Strict gate:
- style bible must be complete before scene prompts.
- visual identity must match channel/audience.
- no inconsistent mixed styles unless deliberate.

Failure loop:
- generate alternate style bibles and pick the strongest.

---

### Stage 5 — Storyboard and shot architecture

Objective: turn script into exact shots with visual, audio, timing, camera, and transition instructions.

Outputs:
- `storyboard/shot-list.json`
- `storyboard/storyboard.md`
- `storyboard/scene-dependency-graph.json`

Tools/skills/plugins:
- Remotion scene model
- ComfyUI prompt planner
- ControlNet/depth/pose planning when needed

Enhancements:
- shot type taxonomy: hero shot, explainer graphic, b-roll, kinetic text, talking avatar, screen recording, chart, transition, call-to-action.
- camera instructions: dolly, pan, push-in, handheld, macro, aerial, static.
- motion intensity and risk score per shot.
- decide image-to-video vs text-to-video vs pure motion graphics.

Strict gate:
- every second of target duration has coverage.
- no orphan narration without visuals.
- no impossible shot assigned to weak local model.

Failure loop:
- simplify high-risk shots or route to better tool/fallback.

---

### Stage 6 — Tool routing and generation plan

Objective: choose the best generation route per shot, balancing quality, cost, and available hardware.

Outputs:
- `routing/tool-routing.json`
- `routing/cost-estimate.json`
- `routing/fallback-plan.json`

Preferred routes:
- motion graphics / UI explainer: Remotion + SVG/HTML/CSS + FFmpeg.
- still illustrations: ComfyUI SDXL/Flux/local image route.
- cinematic b-roll: ComfyUI Wan/Hunyuan/AnimateDiff route where installed, optional fal.ai route when approved.
- avatar/lip sync: only if necessary; must pass uncanny-valley gate.
- product/data visuals: generated charts/SVG/Remotion over AI video.

Enhancements:
- per-shot difficulty scoring.
- local-first route chosen by default.
- paid fallback is precomputed but not executed without permission.
- concurrency and queue plan.

Strict gate:
- every shot has primary route, fallback route, expected cost, expected runtime, and quality risk.
- estimated paid cost under approved cap.

Failure loop:
- downgrade route or request paid approval if local route cannot meet quality.

---

### Stage 7 — Asset generation: images, frames, graphics, references

Objective: produce high-quality still assets and reference frames before video generation.

Outputs:
- `assets/images/`
- `assets/graphics/`
- `assets/reference-frames/`
- `assets/asset-registry.json`

Tools/skills/plugins:
- ComfyUI API workflows
- Flux/SDXL/image model route
- ControlNet preprocessors
- ESRGAN/upscalers
- SVG/HTML generation for crisp UI graphics

Enhancements:
- generate multiple candidates per key image.
- aesthetic scoring and artifact detection.
- face/hand/text artifact checks where relevant.
- preserve seeds and prompts for reproducibility.

Strict gate:
- asset quality >= 8.5/10.
- no broken hands/faces/text where visible.
- no mismatch with style bible.
- all generated assets have prompt, seed, model, and license/source metadata.

Failure loop:
- regenerate with adjusted negative prompts, seed, model, or route.

---

### Stage 8 — Voice generation and audio design

Objective: create human-quality narration and initial sound design.

Outputs:
- `audio/narration.wav`
- `audio/narration-metadata.json`
- `audio/pronunciation-dictionary.json`
- `audio/music-and-sfx-plan.json`

Tools/skills/plugins:
- ElevenLabs Brian-like voice if approved
- local TTS fallback
- FFmpeg loudness normalization
- optional music/SFX generator/library later

Enhancements:
- pronunciation pass before generation.
- emotional delivery tags per paragraph.
- normalize loudness to platform target.
- detect clipped audio/silence/noise.

Strict gate:
- narration sounds human, not robotic.
- duration aligns with script target.
- no clipping, missing lines, or wrong language.
- audio loudness normalized.

Failure loop:
- regenerate bad lines only, not entire narration.

---

### Stage 9 — Subtitles, captions, and text overlays

Objective: create readable, timed captions and on-screen text that improve retention.

Outputs:
- `subtitles/subtitles.srt`
- `subtitles/subtitles.vtt`
- `subtitles/caption-style.json`
- `subtitles/on-screen-text.json`

Tools/skills/plugins:
- alignment from narration timings
- Whisper/local ASR check optional
- ASS subtitles for styled exports
- Remotion text overlays

Enhancements:
- subtitle density rules by platform.
- emphasize key words.
- avoid covering key visual areas.
- multilingual subtitle option.

Strict gate:
- subtitle timing offset within acceptable range.
- no unreadable long lines.
- spelling/punctuation pass.
- style matches style bible.

Failure loop:
- retime, split lines, restyle.

---

### Stage 10 — Video clip generation per scene

Objective: generate or assemble each scene clip with reproducible parameters.

Outputs:
- `clips/raw/`
- `clips/selected/`
- `clips/clip-registry.json`
- `clips/regeneration-log.json`

Tools/skills/plugins:
- ComfyUI WebSocket/API
- Wan/Hunyuan/AnimateDiff workflow slots
- Remotion for deterministic motion graphics
- FFmpeg for trimming/conforming
- optional fal.ai route only with approval

Enhancements:
- generate short clips first; stitch only after QA.
- scene-level retries with diagnosis.
- temporal consistency checks.
- motion smoothness/flicker checks.
- per-scene “best candidate” selection.

Strict gate:
- every clip matches shot spec.
- duration/fps/resolution correct.
- no obvious temporal artifacts, flicker, warping, unreadable generated text.
- subject consistency maintained.

Failure loop:
- regenerate failed scenes only.
- if repeated failure, rewrite scene spec or route to motion graphics.

---

### Stage 11 — Assembly edit and rhythm pass

Objective: assemble scenes into a coherent edit with good rhythm.

Outputs:
- `edit/timeline.json`
- `edit/preview.mp4`
- `edit/edit-decision-list.json`

Tools/skills/plugins:
- Remotion
- FFmpeg
- PySceneDetect-like logic for cuts if handling input footage
- motion graphics templates

Enhancements:
- retention beat check.
- dead-air detection.
- cut timing to narration and music.
- add lower-thirds, labels, callouts, transitions, progress bars.

Strict gate:
- no gaps/black frames unless intentional.
- edit matches pacing plan.
- first 3/10 seconds are strong.
- no abrupt bad cuts or duplicated frames.

Failure loop:
- adjust timeline, trim scenes, add bridge graphics.

---

### Stage 12 — Music, sound effects, and mix

Objective: make the video feel premium, not generated silently over narration.

Outputs:
- `audio/music.wav` or `audio/music-license.json`
- `audio/sfx/`
- `audio/final-mix.wav`
- `audio/mix-report.json`

Tools/skills/plugins:
- local music/SFX library or generator when available
- FFmpeg/audio filters
- loudness meter

Enhancements:
- music energy curve aligned to narrative.
- subtle whooshes/clicks/hits for retention.
- duck music under narration.

Strict gate:
- narration intelligibility preserved.
- no overpowering music.
- license/source metadata exists for all non-generated assets.

Failure loop:
- remix, replace music, lower SFX.

---

### Stage 13 — Render master and platform exports

Objective: produce reliable final media files for target platforms.

Outputs:
- `render/master.mp4`
- `render/final.mp4`
- `render/final.webm` optional
- `render/shorts-vertical.mp4` optional
- `render/thumbnail.png`
- `render/metadata.json`

Tools/skills/plugins:
- Remotion render
- FFmpeg x264/x265/VP9
- thumbnail generator
- optional upscaler

Enhancements:
- render preview first, master second.
- platform presets: YouTube 16:9, Shorts 9:16, X/LinkedIn variants.
- thumbnails generated and scored.
- optional 4K upscale only when it improves quality/cost.

Strict gate:
- final file exists and playable.
- ffprobe duration/fps/resolution match contract.
- audio stream present if required.
- file size acceptable.

Failure loop:
- re-render with adjusted codec/settings.

---

### Stage 14 — Objective technical QA

Objective: detect mechanical failures before subjective review.

Outputs:
- `qa/technical-qa.json`
- `qa/frame-samples/`
- `qa/audio-sync-report.json`

Tools/skills/plugins:
- ffprobe
- FFmpeg frame sampling
- audio waveform checks
- VMAF/SSIM/PSNR where reference exists
- custom temporal/flicker metrics

Enhancements:
- sample frames at scene boundaries and random points.
- detect black frames, frozen frames, dropped frames.
- detect audio-video sync drift.
- detect subtitle overlap/readability issues.

Strict gate:
- all technical checks pass.
- audio-video sync within acceptable threshold.
- no black/frozen frames unless intentional.

Failure loop:
- return to assembly/render or clip generation depending on root cause.

---

### Stage 15 — Creative/semantic QA

Objective: judge whether the video is actually good, coherent, and worth publishing.

Outputs:
- `qa/creative-review.json`
- `qa/llm-judge-report.json`
- `qa/human-review-required.json`

Tools/skills/plugins:
- GLM/Kimi/GPT multimodal judge where available
- Hermes final reviewer
- frame montage review
- citation-vs-script checker

Rubric:
- hook strength
- factual accuracy
- narrative coherence
- visual consistency
- cinematic quality
- pacing/retention
- audio quality
- subtitle readability
- brand/style fit
- publication readiness

Strict gate:
- total creative score >= 9/10 for normal output.
- >= 9.5/10 for “best on market” mode.
- any factual or severe visual issue blocks release.

Failure loop:
- targeted rollback to the earliest failing creative stage.

---

### Stage 16 — Packaging, lineage, and learning

Objective: make the run reusable and auditable.

Outputs:
- `package/run-summary.md`
- `package/artifact-index.json`
- `package/reproducibility.json`
- `learning/lessons.md`
- `learning/skill-updates.md`

Tools/skills/plugins:
- Learning agent
- skill updates when a repeatable pattern is discovered
- Paperclip comments

Enhancements:
- store prompts, seeds, model names, route decisions, cost, retry counts.
- extract reusable prompt formulas.
- mark what improved quality most.

Strict gate:
- no missing artifact metadata.
- no secrets in logs/manifests.
- reusable lessons captured when non-trivial.

Failure loop:
- sanitize and complete package before release.

---

### Stage 17 — Dashboard/product UX and operator controls

Objective: make the pipeline controllable like a serious product, not just a CLI.

Outputs:
- dashboard run page
- live status timeline
- stage artifacts viewer
- approve/regenerate controls
- cost and quality report

Tools/skills/plugins:
- Vercel dashboard
- orchestrator API
- Linear/Vercel/Runway/ElevenLabs-inspired UI systems

Enhancements:
- live progress per stage.
- “regenerate this scene” button.
- compare candidates side-by-side.
- show why a gate failed.
- toggle local-only/local-first/paid fallback.
- show estimated and actual cost.

Strict gate:
- dashboard cannot expose secrets.
- operator can see exactly where a run is stuck.
- every action maps to backend state.

Failure loop:
- block production if UI hides failures or allows unsafe paid execution.

---

### Stage 18 — Release, Paperclip proof, and monitoring

Objective: only call production ready when proof exists.

Outputs:
- final MP4/link
- Paperclip proof comment
- release checklist
- monitoring heartbeat

Tools/skills/plugins:
- Paperclip API
- health checks
- cron/launchd service status
- Telegram notification only after board proof

Strict gate:
- `final.mp4` exists and passes QA.
- dashboard run linked.
- Paperclip `DAN-789`/deployment cards updated.
- no-secret scan passes.
- runtime health check passes.

Failure loop:
- not production ready; keep status in progress with exact blocker.

---

## Scoring model upgrade

Current skeleton: 10 locked steps = 10/10.

Required upgrade: weighted quality scoring.

Score components:
- Contract specificity: 5%
- Research/factual grounding: 10%
- Creative strategy/hook: 10%
- Script/pacing: 10%
- Style/storyboard consistency: 10%
- Asset/clip visual quality: 20%
- Audio/subtitle quality: 10%
- Edit/render technical quality: 10%
- Creative/semantic QA: 10%
- Packaging/reproducibility/no-secret proof: 5%

Release thresholds:
- Draft: >= 7.5, technical QA pass.
- Good: >= 8.5, no severe defects.
- Production: >= 9.0, all gates pass.
- Best-on-market mode: >= 9.5, creative QA pass, technical QA pass, and Hermes final approval.

Important: a pass in every stage is mandatory. Weighted score cannot hide a critical blocker.

---

## Required implementation changes to current codebase

### 1. Replace simple step manifest with strict stage engine

Files:
- Modify `packages/pipeline/src/gsd-video-pipeline.ts`
- Add `packages/pipeline/src/video-pipeline/stage-engine.ts`
- Add `packages/pipeline/src/video-pipeline/schemas.ts`
- Add `packages/pipeline/src/video-pipeline/gates.ts`
- Add `packages/pipeline/src/video-pipeline/routes.ts`

Requirements:
- represent 18 stages.
- every stage has inputs, outputs, status, score, gates, artifacts, retry count, route decision, cost estimate, and failure diagnostics.
- support rollback target on failure.

### 2. Add artifact contract

Files:
- Add `packages/pipeline/src/video-pipeline/artifact-contract.ts`

Requirements:
- standard paths for every stage.
- machine-readable artifact index.
- no-secret sanitizer before writing logs/manifests.

### 3. Add research and citation schema

Files:
- Add `packages/pipeline/src/video-pipeline/research.ts`
- Add tests for citation coverage.

Requirements:
- claims must map to citations or opinion.
- unsupported facts block script lock.

### 4. Add quality gates

Files:
- Add `packages/pipeline/src/video-pipeline/quality-gates.ts`
- Add tests for duration, missing artifact, unsupported claim, weak prompt, cost cap, and no-secret detection.

Requirements:
- gate results include pass/fail, severity, message, suggested fix, rollback stage.

### 5. Add routing planner

Files:
- Add `packages/pipeline/src/video-pipeline/routing-planner.ts`

Requirements:
- choose Remotion, ComfyUI image, ComfyUI video, local TTS, ElevenLabs, FFmpeg, optional fal.ai per scene.
- never execute paid fallback without approved policy.

### 6. Add dashboard run timeline

Files:
- Modify `apps/dashboard/index.html` now.
- Later split into proper app if needed.

Requirements:
- show 18-stage timeline.
- show score breakdown.
- show artifacts.
- show gate failures and recommended fixes.
- show regenerate buttons design, even if backend action is initially stubbed.

### 7. Add orchestrator endpoints

Files:
- Modify `apps/orchestrator/src/server.ts`

Routes:
- `POST /video-pipeline/runs`
- `GET /video-pipeline/runs/:id`
- `POST /video-pipeline/runs/:id/stages/:stageKey/retry`
- `POST /video-pipeline/runs/:id/approve-paid-fallback`
- `GET /video-pipeline/runs/:id/artifacts`

### 8. Add ComfyUI adapter layer

Files:
- Add `apps/orchestrator/src/adapters/comfyui.ts`

Requirements:
- health check `/system_stats`.
- submit API-format workflow JSON.
- monitor over WebSocket where available.
- download outputs safely.
- fail with missing nodes/models diagnostics.

### 9. Add FFmpeg/Remotion adapter layer

Files:
- Add `apps/orchestrator/src/adapters/ffmpeg.ts`
- Add `apps/orchestrator/src/adapters/remotion.ts`

Requirements:
- ffprobe validation.
- render preview/master exports.
- sample frames.
- create thumbnails.

### 10. Add audio/subtitle adapter layer

Files:
- Add `apps/orchestrator/src/adapters/audio.ts`
- Add `apps/orchestrator/src/adapters/subtitles.ts`

Requirements:
- generate SRT/VTT.
- audio duration/loudness analysis.
- subtitle readability validation.

---

## Immediate senior-dev decision

The existing implementation is useful, but it is not yet the best-on-market pipeline. It is a manifest prototype and dashboard scaffold.

The correct next move is not Vercel deployment. The correct next move is to upgrade the core pipeline into the 18-stage strict engine above, with tests and artifacts first. Deployment comes after the engine can prove quality.

Execution order:
1. Implement strict schemas + 18-stage manifest.
2. Implement gates and weighted scoring.
3. Implement artifact contract and no-secret sanitizer.
4. Upgrade dashboard to 18-stage cockpit.
5. Add route planner and adapter interfaces.
6. Add ComfyUI/FFmpeg/Remotion health checks and dry-run adapters.
7. Add real generation adapters incrementally.
8. Add creative/technical QA reports.
9. Only then production deploy.

Definition of done for this blueprint:
- build passes.
- tests pass.
- CLI creates a full 18-stage production package.
- dashboard displays the full production state.
- no paid fallback executes without approval.
- Paperclip has proof.
