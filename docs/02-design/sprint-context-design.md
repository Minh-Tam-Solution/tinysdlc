# TinySDLC - Sprint Context Maintenance Technical Design

**SDLC Version**: 6.1.0
**Stage**: 02 - DESIGN
**Status**: Active
**Authority**: CTO Approved

---

## Overview

This document describes the technical design for the Sprint Context Maintenance feature (v1.2.0). Per SDLC 6.1.0 G-Sprint gate requirements, all project members (AI agents and humans) maintain `CURRENT-SPRINT.md` to track sprint status and preserve context across sessions.

**References**: Sprint plan `docs/01-planning/sprint-plan-sprint-context.md`

---

## Data Model

### CURRENT-SPRINT.md Template

```markdown
# Current Sprint

**Sprint**: (not set)
**Goal**: (not set)
**Status**: PLANNED
**Start**: -
**End**: -

## Deliverables
| Day | Deliverable | Agent | Status |
|-----|-------------|-------|--------|

## Agent Status
<!-- Auto-updated by heartbeat -->

## Activity Log
<!-- Auto-appended by queue processor after each conversation -->
```

### File Location

`CURRENT-SPRINT.md` lives in the **project directory** (per-project, not per-agent):

```
active_project set?
  +-- YES --> projects[active_project].path/CURRENT-SPRINT.md
  +-- NO  --> workspace.path/CURRENT-SPRINT.md (root workspace)
```

This ensures all agents share one sprint file per project, regardless of their isolated workspace directories.

---

## Architecture

### Sprint File Resolution: resolveSprintFile()

**File**: `src/lib/config.ts`

New shared helper reuses existing `getActiveProject()` and `expandTilde()`:

```typescript
export function resolveSprintFile(settings: Settings, workspacePath: string): string | null {
    const activeProject = getActiveProject(settings);
    const baseDir = activeProject
        ? expandTilde(activeProject.path)
        : workspacePath;
    const sprintFile = path.join(baseDir, 'CURRENT-SPRINT.md');
    return fs.existsSync(sprintFile) ? sprintFile : null;
}
```

Used by three consumers:
- `invoke.ts` -- read sprint context before invocation
- `queue-processor.ts` -- write activity log after conversation
- `commands.ts` -- `/sprint` command reads/writes

### Context Injection Flow

Sprint context is injected into the existing message transformation chain in `invoke.ts`:

```
message (raw user input)
  --> project_directory prefix (existing, line 167-180)
  --> sprint context prefix (NEW, after line 180)
  --> provider dispatch (claude/codex/ollama)
```

**Critical**: Injection targets `effectiveMessage` AFTER the `project_directory` block (line 181), NOT the raw `message` variable. This preserves the existing injection chain and avoids coupling issues (Reviewer B1).

```typescript
// After line 180 (after project_directory injection)
const sprintFile = path.join(workingDir, 'CURRENT-SPRINT.md');
if (fs.existsSync(sprintFile)) {
    const sprintContent = fs.readFileSync(sprintFile, 'utf8');
    const lines = sprintContent.split('\n').slice(0, 50);
    effectiveMessage = `[Sprint Context]\n${lines.join('\n')}\n---\n\n${effectiveMessage}`;
}
```

**50-line cap**: Prevents bloating agent prompt. Chosen over character cap to avoid cutting mid-table row.

### Activity Log (Post-Conversation)

**File**: `src/queue-processor.ts` -- in `completeConversation()` after chat history save (line 202)

```typescript
// Best-effort: race condition possible if multiple conversations
// complete simultaneously (acceptable at LITE tier)
const sprintFile = resolveSprintFile(getSettings(), workspacePath);
if (sprintFile) {
    appendActivityLog(sprintFile, agentId, summary, responseLength);
}
```

`appendActivityLog()` implementation:
1. Read CURRENT-SPRINT.md
2. Find `## Activity Log` section
3. Append entry: `- [YYYY-MM-DD HH:mm] @agent: summary (N chars)`
4. Cap at 20 entries (trim oldest)
5. Write back

**Target location**: Project directory via `resolveSprintFile()`, NOT agent workspace (Reviewer B2).

### /sprint Command

**File**: `src/lib/commands.ts`

Sprint file resolution via `getActiveProject()` -- falls back to workspace root if no active project. Returns helpful error if no CURRENT-SPRINT.md found (Reviewer B3).

| Command | Behavior |
| ------- | -------- |
| `/sprint` | Show current sprint info (header fields) |
| `/sprint set <number> <goal>` | Update sprint number and goal |
| `/sprint status` | Show deliverables table and agent status |

### Heartbeat JSON Fix

**File**: `lib/heartbeat-cron.sh` (lines 85-94)

Current heredoc injects raw `heartbeat.md` content into JSON, which breaks when content contains Unicode, quotes, or newlines:

```bash
# BEFORE (broken):
"message": "@${AGENT_ID} ${PROMPT}",

# AFTER (fixed):
PROMPT_ESCAPED=$(echo "$PROMPT" | jq -Rs .)
# ... then use $PROMPT_ESCAPED (already quoted by jq)
```

`jq -Rs .` reads stdin as raw string and outputs it as a properly escaped JSON string (with surrounding quotes).

---

## File Modifications

| File | Change | Lines |
|------|--------|-------|
| `templates/CURRENT-SPRINT.md` | **New** -- Sprint template | ~20 |
| `heartbeat.md` | **Rewrite** -- Sprint-aware prompt, ASCII only | ~5 |
| `lib/heartbeat-cron.sh` | **Edit** -- jq -Rs escaping for JSON safety | ~5 |
| `src/lib/config.ts` | **Edit** -- Add `resolveSprintFile()` helper | ~15 |
| `src/lib/invoke.ts` | **Edit** -- Inject sprint context into effectiveMessage (after line 180) | ~10 |
| `src/queue-processor.ts` | **Edit** -- Append activity log in completeConversation() | ~30 |
| `src/lib/commands.ts` | **Edit** -- Add `/sprint` command handler | ~50 |
| `src/lib/agent-setup.ts` | **Edit** -- Copy CURRENT-SPRINT.md to project dir during setup | ~10 |
| `package.json` | **Edit** -- Bump version to 1.2.0 | ~1 |

**Total**: ~170 lines new/changed. 1 new file, 8 modified.

---

## Security Considerations

- Sprint file path resolved via `resolveSprintFile()` which uses `getActiveProject()` -- only registered projects (validated by SEC-003) can be targets
- No user-supplied paths in `/sprint` command -- sprint file location is deterministic
- Activity log content is generated internally (agent ID + response length), not from user input
- 50-line cap on context injection prevents prompt stuffing

---

## Limitations (v1)

- Activity log writes are best-effort -- concurrent conversation completions may interleave
- Sprint file is per-project, not per-team -- all teams share one sprint context
- `/sprint set` only updates Sprint and Goal fields -- manual editing needed for Deliverables table
- Heartbeat agent status update depends on agent correctly parsing the prompt instruction
