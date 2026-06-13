```markdown
# QA-Forge Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill distills the core development conventions and workflows of the QA-Forge repository, a TypeScript codebase focused on quality assurance automation. It covers code style, file organization, commit patterns, and the main operational workflows for maintaining documentation and metadata. Use this guide to contribute code, documentation, or metadata changes in a way that aligns with established project practices.

## Coding Conventions

**File Naming:**  
- Use `camelCase` for file names.
  - Example: `userService.ts`, `apiClient.test.ts`

**Import Style:**  
- Use relative imports for modules within the project.
  - Example:
    ```typescript
    import { getUser } from './userService';
    ```

**Export Style:**  
- Mixed usage of named and default exports.
  - Example (named):
    ```typescript
    export function getUser(id: string) { ... }
    ```
  - Example (default):
    ```typescript
    export default class UserService { ... }
    ```

**Commit Patterns:**  
- Use [Conventional Commits](https://www.conventionalcommits.org/) with the following prefixes:
  - `chore`: Maintenance or tooling changes
  - `feat`: New features
  - `docs`: Documentation updates
- Commit messages are concise, averaging ~57 characters.
  - Example: `feat: add user authentication middleware`

## Workflows

### Update Documentation and README
**Trigger:** When adding new features, demo flows, or updating public-facing documentation.  
**Command:** `/update-docs`

1. Edit `README.md` to include new features or entry points.
2. Update related documentation files such as `DESIGN.md`, `GOAL.md`, or deployment guides.
3. If permissions or local settings change, update `.claude/settings.local.json`.
4. Commit changes with a `docs:` or `chore:` prefix as appropriate.

**Example:**
```bash
# Edit documentation files
nano README.md
nano DESIGN.md

# Optionally update settings
nano .claude/settings.local.json

# Commit changes
git add README.md DESIGN.md .claude/settings.local.json
git commit -m "docs: update docs for new feature"
git push
```

### Regenerate GitNexus and Claude Metadata
**Trigger:** After major commits (e.g., moving from demo to production), or when code graphs and agent skill docs need updating.  
**Command:** `/refresh-gitnexus`

1. Run GitNexus to re-analyze the repository structure.
2. Regenerate `AGENTS.md` and `CLAUDE.md` with updated documentation blocks.
3. Update all relevant `.claude/skills/gitnexus/*/SKILL.md` files.
4. Optionally update `.claude/settings.local.json` if configuration changes.
5. Commit and push all updated files.

**Example:**
```bash
# Run GitNexus analysis
npx gitnexus analyze

# Regenerate documentation
npx gitnexus generate-docs

# Update skill files
nano .claude/skills/gitnexus/gitnexus-cli/SKILL.md

# Commit changes
git add AGENTS.md CLAUDE.md .claude/skills/gitnexus/*/SKILL.md
git commit -m "chore: refresh gitnexus metadata after major update"
git push
```

## Testing Patterns

- **Framework:** [Vitest](https://vitest.dev/)
- **Test File Pattern:** Files end with `.test.ts`
  - Example: `apiClient.test.ts`
- **Test Example:**
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { getUser } from './userService';

  describe('getUser', () => {
    it('returns user data for valid ID', () => {
      expect(getUser('123')).toEqual({ id: '123', name: 'Alice' });
    });
  });
  ```

## Commands

| Command           | Purpose                                                         |
|-------------------|-----------------------------------------------------------------|
| /update-docs      | Update documentation and README with new features or flows       |
| /refresh-gitnexus | Regenerate GitNexus analysis and managed documentation blocks   |
```