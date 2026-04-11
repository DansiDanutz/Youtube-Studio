# YouTube Studio Product Specification

## Context

This repository started as an empty workspace. The specification below upgrades the original bootstrap MVP into a stronger product definition: a powerful internal YouTube content operating system that still ships in disciplined phases.

This product is not a clone of YouTube's official Studio. It is an AI-assisted production cockpit for creating, reviewing, improving, packaging, and eventually publishing faceless educational YouTube content with minimal friction.

## Product Vision

Build the most useful internal YouTube Studio for high-output creators and small teams:

- powerful enough to orchestrate the full content pipeline
- simple enough that one operator can use it confidently every day
- opinionated enough to prevent low-quality or wasteful output
- modular enough to expand from Shorts into a broader content system later

The product should feel less like a generic admin dashboard and more like a production cockpit:

- one place to create runs
- one place to review output
- one place to fix problems
- one place to understand quality, cost, and throughput

## Product Objective

Ship a repeatable system that can turn a structured topic brief into a publishable YouTube Short with human review concentrated only at the checkpoints that materially improve quality.

After the MVP proves reliable, expand it into a creator operating system with richer tools for:

- topic ideation
- research and fact validation
- script and hook iteration
- asset generation and replacement
- quality scoring
- packaging and publish readiness
- library reuse and performance learning

## Primary Users

### 1. Solo Operator

The first core user is a solo operator running one or more faceless educational channels.

This user wants:

- to move from topic to publishable draft quickly
- to avoid timeline editing tools for routine content
- to keep costs visible and under control
- to approve content in a few decisive review steps

### 2. Small Content Team

The second user is a very small team with clearly split roles:

- researcher
- script reviewer
- operator/editor
- publisher or channel owner

This user wants:

- role-based handoffs
- consistent output quality
- reusable presets
- run history and failure visibility

## Product Promise

Given a topic, audience, fact pack, style preset, and channel intent, the system returns a ready-to-review content package that feels close to publishable without requiring manual editing software for normal cases.

The operator should not need to:

- manually write a first-pass script
- manually source basic visuals
- manually time captions
- manually assemble routine edits
- manually rewrite metadata from scratch

The operator should remain in control of:

- the angle
- factual boundaries
- brand and tone
- final approval
- publishing decision

## Design Principles

### 1. Powerful by default

The system should expose many useful tools, but not all at once.

The user should feel:

- guided during the happy path
- empowered during debugging and iteration
- never buried under unnecessary controls

### 2. One-screen clarity

Every run should answer these questions immediately:

- what stage is this in
- what is blocked
- what changed since the last review
- what do I need to approve next
- how much has this cost

### 3. Review beats editing

The default workflow should prefer:

- approve
- reject
- regenerate
- swap component
- request safer alternative

over:

- manual frame edits
- manual subtitle edits
- manual timeline surgery

### 4. Reuse over rework

The product should accumulate reusable assets:

- briefs
- fact packs
- hook patterns
- voice presets
- visual styles
- title and thumbnail patterns
- prior winning packages

### 5. Observable production

Every run should produce:

- stage status
- cost
- latency
- retries
- failure reason
- review verdict

The system should teach the operator what works and what fails.

## Core Jobs To Be Done

1. Turn a topic into a content brief.
2. Turn the brief into a grounded script.
3. Turn the script into voice, captions, visuals, and assembly.
4. Review output without leaving the product.
5. Package the result for publishing.
6. Understand why a run failed or was rejected.
7. Improve future runs through presets, patterns, and analytics.

## Supported Output Lanes

### MVP lane

- 45 to 60 second vertical 9:16 YouTube Short
- one narrator voice
- full captions
- image sequence or lightweight motion-graphic visuals
- factual micro-explainer structure

### Planned next lanes

- 60 to 90 second enhanced Short with stronger pacing controls
- variant generation for multiple hooks or CTA endings
- thumbnail and metadata experimentation
- long-form planning mode without full render support yet

## Content Structure

Default Shorts structure:

1. hook in the first 2 seconds
2. setup and context
3. three supporting beats
4. payoff
5. soft CTA

The system should support structured variation, for example:

- controversy hook
- curiosity gap hook
- misconception correction
- list format
- before/after explanation

## Required Inputs

- topic
- target audience
- desired takeaway
- fact pack or source notes
- style preset
- channel preset
- optional banned claims
- optional tone constraints
- optional required CTA
- optional asset constraints

## Required Outputs

- normalized brief
- fact map with traceable claims
- reviewable script draft
- narration audio
- audio-aligned captions
- shot plan
- asset bundle
- rendered 1080x1920 mp4
- publish package with title, description, hashtag set, thumbnail candidate, and notes

## Human Review Checkpoints

### 1. Brief Review

Approve:

- topic
- audience
- factual angle
- unsafe claims or banned claims
- tone constraints
- channel fit

### 2. Script Review

Approve:

- opening hook
- claim wording
- pacing
- final script
- pronunciation or tone flags

### 3. Final Cut Review

Approve:

- assembled Short
- captions
- visual continuity
- pacing
- thumbnail candidate
- title and description draft

The MVP should not require frame-level manual editing between these checkpoints.

## Publishable Output Definition

A video is publishable when all of the following are true:

- factual claims match the approved brief and script
- the hook is clear in the first 2 seconds
- narration is intelligible and free of obvious mispronunciations
- captions cover the full video and match the final audio
- visuals support each beat and do not contradict it
- pacing stays inside the target duration
- export is a valid Shorts-ready vertical file
- title and description draft match the approved angle
- the operator can approve it without leaving the review surface

## User Experience Requirements

### Run Workspace

Every run page must make it easy to:

- see stage-by-stage progress
- preview current artifacts
- compare regenerated versions
- inspect failures
- understand cost and latency
- decide the next action quickly

### Tooling Surface

The product should eventually include many tools, but organized in clear zones:

- Brief tools
- Research tools
- Script tools
- Voice tools
- Visual tools
- Packaging tools
- Diagnostics tools

The default UI should surface only the next useful controls.
Advanced controls should remain visible but secondary.

### Required Ease-Of-Use Standard

The operator should be able to:

- submit a run in under 2 minutes
- complete a review pass in under 5 minutes
- understand a failure without reading raw logs in most cases
- re-run only one broken stage instead of restarting the whole flow

## Power Features To Grow Into

These are in scope for the broader product, even if not all ship on day one:

- idea inbox and topic queue
- reusable research library
- fact-pack builder and verifier
- hook explorer with multi-variant scoring
- script comparison view
- voice preset and pronunciation library
- visual replacement or swap tool
- timeline-free scene editor
- title and thumbnail variant generator
- publish readiness checklist
- channel presets per brand or channel
- reusable content templates
- quality and performance analytics
- failure clustering and recommendation engine
- asset and script reuse from previous winning runs

## Explicit Non-Goals For The First Release

The first release still does not need to handle:

- full manual NLE replacement
- creator-on-camera workflows
- advanced motion design
- generalized multi-format content tooling
- fully autonomous publishing without review
- social distribution beyond the publish package

## Success Metrics

### MVP success

The first implementation is successful when it can reliably produce one publishable Short while meeting these constraints:

- end-to-end cycle time under 15 minutes excluding human wait time
- reviewer decision time under 5 minutes
- direct generation cost low enough to support daily experimentation
- the same workflow works across multiple topics without manual re-editing

### Product success

The broader product is successful when it:

- increases publish frequency
- reduces manual editing hours
- improves review confidence
- makes failure causes obvious
- lets the operator improve output quality over time

## MVP User Journey

1. Operator creates a run and submits the structured brief.
2. System validates the request against product constraints.
3. Operator reviews and approves the brief.
4. System generates the script and claim map.
5. Operator reviews and approves the script.
6. System generates voice, captions, shot plan, assets, assembly, and packaging.
7. Operator reviews and approves the final cut.
8. System stores the run, telemetry, rejection reasons, and reusable artifacts.

## Product Evolution Path

### Phase 1

Deliver one strong Shorts lane.

### Phase 2

Add more operator tools inside the run workspace:

- regenerate specific stages
- compare variants
- swap voices or visuals
- inspect claim grounding

### Phase 3

Add reusable studio intelligence:

- presets
- content memory
- high-performing pattern reuse
- analytics-informed iteration

### Phase 4

Turn the product into a full studio cockpit for multi-run planning, review, and output management.
