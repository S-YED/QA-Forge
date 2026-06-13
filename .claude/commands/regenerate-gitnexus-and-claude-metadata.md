---
name: regenerate-gitnexus-and-claude-metadata
description: Workflow command scaffold for regenerate-gitnexus-and-claude-metadata in QA-Forge.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /regenerate-gitnexus-and-claude-metadata

Use this workflow when working on **regenerate-gitnexus-and-claude-metadata** in `QA-Forge`.

## Goal

Refreshes GitNexus analysis and regenerates managed documentation blocks after significant repo changes.

## Common Files

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`
- `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`
- `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`
- `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Run GitNexus to re-analyze the repo structure.
- Regenerate AGENTS.md and CLAUDE.md with updated blocks.
- Update .claude/skills/gitnexus/*/SKILL.md files.
- Optionally update .claude/settings.local.json.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.