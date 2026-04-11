# YouTube Studio

An open-source AI production cockpit for creating, reviewing, and packaging high-quality faceless YouTube videos and Shorts.

YouTube Studio is designed to feel like a real content operating system:

- powerful enough to orchestrate a multi-stage generation pipeline
- simple enough for a solo operator to use every day
- structured enough for teams to collaborate without chaos

This project is not a clone of YouTube's official Studio. It is a creator-side production system focused on turning a structured brief into a reviewable, publish-ready content package.

## Why This Project Is Different

Most AI video tools stop at one generated artifact.

YouTube Studio is trying to solve the whole operator workflow:

- brief
- grounding
- script
- voice
- captions
- visuals
- packaging
- review
- diagnostics

The goal is not just “generate a video.”

The goal is to make AI-assisted YouTube production feel reliable, inspectable, reusable, and genuinely pleasant to operate.

## Why This Exists

Most AI video tools are good at one isolated step:

- script generation
- voice generation
- captioning
- image generation
- editing

But creators still end up stitching everything together manually.

YouTube Studio aims to solve the workflow, not just the single tool problem.

## What It Will Do

The product is being built in phases.

### Current focus

The first implementation targets one strong lane:

- faceless educational 9:16 YouTube Shorts
- structured brief intake
- grounded script generation
- review checkpoints instead of manual editing
- stage-by-stage artifacts and telemetry

### Planned capabilities

- idea inbox and topic queue
- fact-pack and claim validation
- script and hook variants
- voice presets and pronunciation controls
- shot planning and asset generation
- timeline-free review workflow
- title, description, and thumbnail packaging
- searchable run history and reusable content patterns

## Product Principles

- Powerful by default, not overwhelming by default
- Review-first instead of timeline-edit-first
- Reuse over rework
- Clear operator feedback at every stage
- Modular architecture with disciplined scope

## Repository Structure

```text
apps/
  orchestrator/        CLI and future control-plane entrypoints
packages/
  domain/              core types, entities, and contracts
  pipeline/            generation and stage logic
  telemetry/           run ledger and metrics
docs/
  specification.md     product specification
  architecture.md      system architecture
  worker-topology.md   delivery topology
operations/
  *.md                 operator runbooks
fixtures/
  topics/              deterministic smoke fixtures
plans/
  *.md                 implementation planning artifacts
scripts/
  *.mjs                utility scripts
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+

### Install

```bash
pnpm install
```

### Validate the environment

```bash
pnpm run env:check
```

### Typecheck and test

```bash
pnpm run typecheck
pnpm run test
```

### Run the deterministic smoke flow

```bash
pnpm run job:smoke
```

## Project Status

This project is in an early but actively structured phase.

What already exists:

- public product spec
- architecture and worker topology
- initial workspace structure
- smoke-flow scaffolding
- run ledger and review artifact flow

What is still under active construction:

- full app shell
- review UI
- voice, captions, visuals, and render stages
- packaging and publish workflow

## Documentation

- [Docs Index](docs/README.md)
- [Product Specification](docs/specification.md)
- [Architecture](docs/architecture.md)
- [Worker Topology](docs/worker-topology.md)
- [Provider Smoke Runbook](operations/2026-04-11-provider-smoke-runbook.md)
- [Implementation Backlog](plans/2026-04-11-first-implementation-backlog.md)
- [Roadmap](ROADMAP.md)

## Contributing

We want this repo to become a strong open-source project, not a messy demo.

Before opening a PR:

- read [CONTRIBUTING.md](CONTRIBUTING.md)
- keep changes scoped and reviewable
- avoid widening scope without updating the spec
- prefer improving the operator experience, reliability, and clarity

## Open Source Goals

We want YouTube Studio to become:

- a serious open-source creator tooling project
- a reliable AI video workflow foundation
- a place where strong UX and strong systems design meet

If you care about AI-native content tooling, operator experience, or production orchestration, you are in the right repo.

## Contributing Quick Start

```bash
pnpm install
pnpm run env:check
pnpm run typecheck
pnpm run test
```

Then read:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [ROADMAP.md](ROADMAP.md)
- [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)
