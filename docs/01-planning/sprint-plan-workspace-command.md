# TinySDLC - Sprint S03: In-Chat Workspace Command

**SDLC Version**: 6.1.0
**Stage**: 01 - PLANNING
**Status**: Active
**Authority**: CTO Approved

---

## Sprint Overview

| Field | Value |
| ----- | ----- |
| Sprint ID | S03 |
| Sprint Name | In-Chat Workspace Command |
| Duration | 1 day |
| Tier | LITE |
| Predecessor | S02 (CTO-2026-002 Ecosystem Upgrade) |

## Problem Statement

TinySDLC agents are currently bound to a single `working_directory` per agent. Users who work across multiple project repos must manually edit `settings.json` to switch projects. There is no way to switch the active project from within chat channels (Telegram, Discord, WhatsApp, Zalo).

When a user attempted to send a repo path via Telegram, the shell guard (SEC-003) correctly blocked it as a directory traversal. This highlighted the need for a governed project-switching mechanism.

## Goal

Enable users to register, switch, and manage project workspaces from any chat channel via `/workspace` commands, with all security validations enforced.

## Requirements

### Functional

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| FR-01 | Users can register project repos with aliases via `/workspace add <alias> <path>` | P0 |
| FR-02 | Users can switch the active project via `/workspace set <alias>` | P0 |
| FR-03 | Users can list registered projects via `/workspace` or `/workspace list` | P0 |
| FR-04 | Users can remove registered projects via `/workspace remove <alias>` | P1 |
| FR-05 | Switching workspace auto-resets all agent conversations | P0 |
| FR-06 | Commands work across ALL channels (including plugins like Zalo) | P0 |
| FR-07 | Agent identity (role, name, provider) is unchanged when switching projects | P0 |

### Non-Functional

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| NF-01 | Project paths validated against homedir (SEC-003 extension) | P0 |
| NF-02 | Symlink resolution prevents escape attacks | P0 |
| NF-03 | Atomic settings write (temp + renameSync) prevents corruption | P0 |
| NF-04 | No new npm dependencies | P0 |
| NF-05 | Zero downtime — settings hot-reload on next message | P1 |

## Deliverables

| # | Deliverable | Type |
| - | ----------- | ---- |
| 1 | Sprint plan (this document) | Doc |
| 2 | Technical design document | Doc |
| 3 | `src/lib/types.ts` — ProjectConfig interface | Code |
| 4 | `src/lib/config.ts` — writeSettings(), getActiveProject() | Code |
| 5 | `src/lib/commands.ts` — shared command handler | Code |
| 6 | `src/queue-processor.ts` — command intercept | Code |
| 7 | `src/lib/invoke.ts` — active project resolution | Code |
| 8 | Channel client cleanup (remove duplicated command code) | Code |
| 9 | `CLAUDE.md` update | Doc |

## Architecture Decision

**Command intercept location**: Queue processor (not channel clients). This ensures all channels — including plugin-based channels (Zalo OA, Zalo Personal) — benefit from `/workspace` commands without per-plugin modifications.

**Scope**: Global (all agents switch at once). Per-agent project switching adds complexity unsuitable for LITE tier. Each machine runs 1 TinySDLC session.

## Exit Criteria

- `npm run build` passes with 0 errors
- `/workspace` commands work from Telegram
- Project switching changes agent CLI working directory
- Settings write is atomic (temp + renameSync)
- All agent conversations auto-reset on workspace switch
