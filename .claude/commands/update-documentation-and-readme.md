---
name: update-documentation-and-readme
description: Workflow command scaffold for update-documentation-and-readme in QA-Forge.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /update-documentation-and-readme

Use this workflow when working on **update-documentation-and-readme** in `QA-Forge`.

## Goal

Keeps documentation files and README up to date with new features, flows, or public endpoints.

## Common Files

- `README.md`
- `DESIGN.md`
- `GOAL.md`
- `artifacts/01-Production-Deployment-Guide.md`
- `.claude/settings.local.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit README.md to reflect new features or entry points.
- Update related documentation files (e.g., DESIGN.md, GOAL.md, deployment guides).
- Optionally update .claude/settings.local.json if permissions or local settings change.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.