# TinySDLC - Sprint S05: Sprint Context Maintenance

**SDLC Version**: 6.1.0
**Stage**: 01 - PLANNING
**Status**: Active
**Authority**: CTO Approved
**Date**: 2026-02-22
**Sprint**: S05 — Sprint Context Maintenance
**Design**: [Sprint Context Design](../02-design/sprint-context-design.md)

---

## Sprint Overview

| Field | Value |
| ----- | ----- |
| Sprint ID | S05 |
| Sprint Name | Sprint Context Maintenance |
| Target Version | v1.2.0 |
| Duration | 1 day |
| Tier | LITE |
| Predecessor | S04 (ZeroClaw Patterns) + v1.1.0 (Cross-Team Routing) |

## Problem Statement

Per SDLC 6.1.0 G-Sprint / G-Sprint-Close gates, all project members (AI agents and humans) must maintain `CURRENT-SPRINT.md` to track sprint status and preserve project context. Currently TinySDLC has:

1. **No shared sprint context** -- agents work in isolated workspaces with no shared sprint file
2. **Generic heartbeat prompt** -- "Quick status check" doesn't reference sprint status
3. **No context injection** -- agents don't receive project-level sprint info before invocation
4. **Corrupt JSON from heartbeat** -- Unicode characters in `heartbeat.md` break queue JSON parsing when injected via shell heredoc

## Goal

Agents read sprint context before work and update it after completing tasks, following SDLC 6.1.0 G-Sprint requirements (LITE tier: optional but recommended).

---

## Requirements

### Functional

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| FR-01 | CURRENT-SPRINT.md template created during `sdlc init` | P0 |
| FR-02 | Sprint context injected into agent messages before invocation | P0 |
| FR-03 | Activity log auto-appended after each conversation completes | P0 |
| FR-04 | `/sprint` command shows current sprint info via any channel | P1 |
| FR-05 | `/sprint set <number> <goal>` updates sprint number and goal | P1 |
| FR-06 | Heartbeat prompts reference sprint context (ASCII only) | P1 |
| FR-07 | Sprint file resolves to project directory when active_project set | P0 |

### Non-Functional

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| NF-01 | Sprint context injection capped at 50 lines (avoids bloating agent prompt) | P0 |
| NF-02 | Activity log capped at 20 entries (prevents unbounded file growth) | P0 |
| NF-03 | Heartbeat JSON properly escaped via `jq -Rs` (fixes corrupt JSON bug) | P0 |
| NF-04 | Activity log is best-effort (race condition acceptable at LITE tier) | P1 |
| NF-05 | No new npm dependencies | P0 |

---

## Deliverables

| # | Deliverable | Type |
| - | ----------- | ---- |
| 1 | Sprint plan (this document) | Doc |
| 2 | Technical design document | Doc |
| 3 | `templates/CURRENT-SPRINT.md` -- sprint template | Template |
| 4 | `heartbeat.md` -- rewritten (ASCII only, sprint-aware) | Template |
| 5 | `lib/heartbeat-cron.sh` -- jq -Rs JSON escaping fix | Code |
| 6 | `src/lib/config.ts` -- `resolveSprintFile()` helper | Code |
| 7 | `src/lib/invoke.ts` -- sprint context injection into effectiveMessage | Code |
| 8 | `src/queue-processor.ts` -- activity log in completeConversation() | Code |
| 9 | `src/lib/commands.ts` -- `/sprint` command handler | Code |
| 10 | `src/lib/agent-setup.ts` -- copy CURRENT-SPRINT.md to project dir | Code |
| 11 | Version bump to v1.2.0 | Code |
| 12 | `docs/README.md` update | Doc |

---

## Task Breakdown

### Batch 1 -- Templates & Heartbeat Fix

| Task | File | Status |
|------|------|--------|
| Create CURRENT-SPRINT.md template | `templates/CURRENT-SPRINT.md` | Done |
| Rewrite heartbeat.md (ASCII only) | `heartbeat.md` | Done |
| Fix JSON escaping in heartbeat-cron.sh | `lib/heartbeat-cron.sh` | Pending |

### Batch 2 -- Core TypeScript (Sprint Context)

| Task | File | Status |
|------|------|--------|
| Add `resolveSprintFile()` helper | `src/lib/config.ts` | Pending |
| Inject sprint context into effectiveMessage | `src/lib/invoke.ts` | Pending |
| Append activity log in completeConversation() | `src/queue-processor.ts` | Pending |

### Batch 3 -- Command & Setup

| Task | File | Status |
|------|------|--------|
| Add `/sprint` command handler | `src/lib/commands.ts` | Pending |
| Copy CURRENT-SPRINT.md during agent setup | `src/lib/agent-setup.ts` | Pending |

### Batch 4 -- Build, Version & Docs

| Task | File | Status |
|------|------|--------|
| Bump version to v1.2.0 | `package.json` | Pending |
| Update docs README | `docs/README.md` | Pending |
| Build and verify | `npm run build` | Pending |

---

## Reviewer Feedback (Pre-Implementation)

@reviewer provided code review on the implementation plan with 3 blocking issues (all addressed in design doc):

| Issue | Problem | Resolution |
|-------|---------|------------|
| B1 | Sprint context injection into `message` before `effectiveMessage` built | Inject into `effectiveMessage` after project_directory injection (line 181) |
| B2 | Activity log writes to first agent's workspace, not shared location | Use `resolveSprintFile()` targeting project directory |
| B3 | `/sprint` command targets undefined "active workspace" | Resolve via `getActiveProject()`, fall back to workspace root |

---

## Exit Criteria

- `npm run build` passes with 0 errors
- `templates/CURRENT-SPRINT.md` exists with correct template structure
- `/sprint` command responds via Telegram with sprint status
- `/sprint set 5 implement login` updates CURRENT-SPRINT.md
- Sprint context visible in agent invocation logs
- Activity log entries appended after team conversations complete
- Heartbeat cycle produces no JSON parse errors
- `package.json` version is `1.2.0`

---

## Gate Checkpoint

**Current gate**: G0.1 (Problem Validated)
**Target gate after S05**: G1 -- Requirements Complete

G1 requires:
- All core requirements documented and implemented
- Sprint context maintenance covers G-Sprint gate requirements
- Design document approved by reviewer
- Sprint plan approved by CTO
