# Contributing to YouTube Studio

Thanks for contributing.

This project is trying to become a serious open-source production cockpit for AI-assisted YouTube creation, so quality matters.

## Before You Start

Read these first:

- [README.md](README.md)
- [docs/specification.md](docs/specification.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/worker-topology.md](docs/worker-topology.md)

If your proposed change conflicts with the spec or architecture, update those documents as part of the PR.

## Contribution Priorities

We especially welcome contributions in:

- operator UX and review workflow clarity
- stage reliability and retry behavior
- artifact contracts and data model quality
- grounded generation and quality verification
- reusable presets, retrieval, and library tooling
- tests and failure diagnostics

## Development Workflow

1. Fork the repo.
2. Create a focused branch.
3. Keep the change scoped to one clear objective.
4. Run:

```bash
pnpm install
pnpm run typecheck
pnpm run test
```

5. Update docs when behavior, scope, or architecture changes.
6. Open a PR with:
   - what changed
   - why it changed
   - how it was verified

## Expectations

- Keep diffs reviewable.
- Prefer small, composable changes over giant rewrites.
- Do not widen product scope casually.
- Preserve the principle of “powerful but easy to use.”
- Avoid hidden magic. Favor explicit contracts and observable behavior.

## Product Guardrails

Do not optimize for:

- maximum feature count with poor workflow clarity
- microservice complexity before it is necessary
- provider-specific hacks leaking into core interfaces
- UI complexity that makes the happy path worse

## Pull Request Guidance

A good PR should answer:

- What user or operator problem does this solve?
- Which part of the product or architecture does it affect?
- How do we know it works?
- What tradeoffs did we accept?

## Code of Conduct

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
