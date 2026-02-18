# TinySDLC - Workspace Command Technical Design

**SDLC Version**: 6.0.6
**Stage**: 02 - DESIGN
**Status**: Active
**Authority**: CTO Approved

---

## Overview

This document describes the technical design for the in-chat `/workspace` command feature, enabling users to register and switch between project repos from any messaging channel.

**References**: Sprint plan `docs/01-planning/sprint-plan-workspace-command.md`

---

## Data Model

### New Interface: ProjectConfig

```typescript
// src/lib/types.ts
export interface ProjectConfig {
    name: string;    // Human-readable project name
    path: string;    // Absolute path to project directory
}
```

### Settings Extension

```typescript
// Added to existing Settings interface
export interface Settings {
    // ... existing fields ...
    projects?: Record<string, ProjectConfig>;  // Project registry (alias → config)
    active_project?: string;                   // Key into projects registry
}
```

### settings.json Example

```json
{
  "workspace": { "path": "~/tinysdlc-workspace" },
  "projects": {
    "tinysdlc": {
      "name": "TinySDLC",
      "path": "/Users/me/repos/tinysdlc"
    },
    "webapp": {
      "name": "My Web App",
      "path": "/Users/me/repos/webapp"
    }
  },
  "active_project": "tinysdlc",
  "agents": { ... }
}
```

---

## Command Syntax

All commands accept both `/` and `!` prefixes (consistent with existing commands).

| Command | Behavior |
| ------- | -------- |
| `/workspace` | Show current active project and list all registered projects |
| `/workspace list` | List all registered projects with paths |
| `/workspace add <alias> <path>` | Register a new project (validates path) |
| `/workspace set <alias>` | Switch active project + auto-reset all agents |
| `/workspace remove <alias>` | Unregister a project (cannot remove active) |

---

## Architecture

### Command Intercept Point: Queue Processor

Commands are intercepted in `queue-processor.ts` **before** agent routing. This is a deliberate design choice (CTO OBS-1) ensuring ALL channels benefit — including plugin-based channels (Zalo OA, Zalo Personal) that bypass legacy channel clients.

```text
Message Flow (with command intercept):

Channel → incoming/ → processing/ → [COMMAND CHECK] → outgoing/
                                          │
                                          ├─ Is command? → handleCommand() → response to outgoing/
                                          └─ Not command? → route to agent (existing flow)
```

### Shared Command Handler Module

New file `src/lib/commands.ts` consolidates all command logic:

```typescript
export interface CommandResult {
    response: string;
}

/**
 * Try to handle a message as an in-chat command.
 * Returns CommandResult if it was a command, null if it should be queued normally.
 */
export function handleCommand(messageText: string, settings: Settings): CommandResult | null;
```

This module handles: `/agent`, `/team`, `/reset`, `/workspace` (and future commands).

The existing duplicated `getAgentListText()` and `getTeamListText()` functions (identical in telegram-client.ts, discord-client.ts, whatsapp-client.ts) are consolidated here.

---

## Working Directory Resolution

### Current Flow (invoke.ts)

```
agent.working_directory → expandTilde → resolve → validatePath → cwd
```

### New Flow (with active project)

```
active_project set in settings?
  ├─ YES → projects[active_project].path → expandTilde → resolve → validatePath → cwd
  └─ NO  → agent.working_directory → expandTilde → resolve → validatePath → cwd (unchanged)
```

### Separation of Concerns

| Concept | Location | Purpose |
| ------- | -------- | ------- |
| Agent workspace | `~/tinysdlc-workspace/{agent_id}/` | Identity files: `.claude/`, `AGENTS.md`, `SOUL.md` |
| Active project | `projects[active_project].path` | CLI `cwd` — where agent actually works |
| `project_directory` (existing) | `agent.project_directory` | Message context injection (unchanged) |

**Key**: `/workspace set` overrides `working_directory` only. The existing `project_directory` field remains an agent-level override for message context injection, independent of workspace switching.

---

## Security Design (SEC-003 Extension)

### Path Validation for `/workspace add`

1. **Alias format**: Must match `[a-z0-9][a-z0-9-]*` (prevents injection)
2. **Path resolution**: `path.resolve(expandTilde(rawPath))` normalizes the path
3. **Homedir check**: Resolved path must start with `os.homedir()`
4. **Symlink check**: `fs.realpathSync()` resolves symlinks, re-check against homedir
5. **Directory check**: Path must exist and be a directory (`fs.statSync().isDirectory()`)

### Active Project Validation

Only registered projects (keys in `settings.projects`) can be set as active. No ad-hoc paths via `/workspace set`.

### Working Directory Validation

The existing `validatePath()` in `invoke.ts` (SEC-003) validates the final working directory against `workspacePath` and `os.homedir()`. Active project paths flow through this same check.

---

## Atomic Settings Write (OBS-2)

`writeSettings()` in `config.ts` uses atomic write pattern:

```typescript
export function writeSettings(settings: Settings): void {
    const tmpFile = SETTINGS_FILE + '.tmp';
    // 1. Re-read current settings to avoid stale overwrites
    const current = readSettingsRaw();
    // 2. Merge only the changed fields
    const merged = { ...current, ...settings };
    // 3. Write to temp file
    fs.writeFileSync(tmpFile, JSON.stringify(merged, null, 2) + '\n');
    // 4. Backup existing
    if (fs.existsSync(SETTINGS_FILE)) {
        fs.copyFileSync(SETTINGS_FILE, SETTINGS_FILE + '.bak');
    }
    // 5. Atomic rename
    fs.renameSync(tmpFile, SETTINGS_FILE);
}
```

This prevents corruption if queue-processor reads settings while a workspace command is writing.

---

## Conversation Reset on Workspace Switch

When `/workspace set` changes the active project:

1. Write `reset_flag` file for every agent in workspace
2. Same mechanism as existing `/reset` command
3. Queue processor checks for `reset_flag` before each invocation (existing code)
4. Rationale: Claude CLI `-c` continues conversation in directory context. Changing directory makes old context stale.

**Scope**: Global — all agents reset. v1 does not support per-sender active projects (documented limitation).

---

## Files Modified

| File | Change |
| ---- | ------ |
| `src/lib/types.ts` | Add `ProjectConfig` interface, `projects?` and `active_project?` to `Settings` |
| `src/lib/config.ts` | Add `writeSettings()`, `getActiveProject()`, `expandTilde()` export |
| `src/lib/commands.ts` | **NEW** — shared command handler with workspace + agent/team/reset commands |
| `src/queue-processor.ts` | Add command intercept before agent routing |
| `src/lib/invoke.ts` | Resolve working directory from active project |
| `src/channels/telegram-client.ts` | Remove command handling code, add `/workspace` to bot commands |
| `src/channels/discord-client.ts` | Remove command handling code |
| `src/channels/whatsapp-client.ts` | Remove command handling code |

---

## Limitations (v1)

- `active_project` is global — all senders share the same active project
- No per-agent project assignment (all agents work in the same project)
- Project path must be within `os.homedir()` (no system paths)
- No project templates or initialization (user must have existing repo)
