# Security Policy

## Supported Scope

This project is early-stage, but security issues are still taken seriously.

Please report vulnerabilities related to:

- authentication and authorization
- secret handling
- provider credentials
- artifact exposure
- storage access
- unsafe prompt or generation boundaries that could lead to harmful outputs

## Reporting

Please do not open public issues for security-sensitive vulnerabilities.

Instead, report them privately to the maintainers with:

- affected area
- reproduction steps
- impact
- suggested mitigation if known

## What to Include

- exact component or path
- whether the issue is theoretical or reproducible
- whether it affects local development, hosted deployment, or both
- whether secrets or user data may be exposed

## Response Expectations

We aim to:

- acknowledge reports quickly
- validate severity
- ship a mitigation or fix as soon as practical

## Hard Rules for Contributors

- never commit real API keys or secrets
- never widen access boundaries casually
- never bypass review gates for unsafe content handling without documenting the risk
