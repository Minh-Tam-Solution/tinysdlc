# TinySDLC - Sprint Plan: SDLC Framework v6.1.0 Support

**SDLC Version**: 6.1.0
**Stage**: 01 - PLANNING
**Status**: Active
**Authority**: CTO Approved
**Date**: 2026-02-16
**Sprint**: S01 — SDLC Framework Support

---

## Sprint Goal

Make TinySDLC SDLC Framework v6.1.0 ready out of the box. Any user who understands the framework should be able to apply it immediately using `tinysdlc sdlc init` without manual configuration.

---

## Scope

### In Scope

- TypeScript type changes (backward compatible) — `AgentConfig`, `TeamConfig`, `Settings`
- Ollama provider support (3rd provider alongside Anthropic, OpenAI)
- System prompt injection via `SYSTEM_CONTEXT.md`
- 6 SDLC role-specific `AGENTS.md` templates
- Default SDLC settings template (`templates/settings.sdlc-default.json`)
- `tinysdlc sdlc` CLI commands: `status`, `init`, `roles`
- Setup wizard SDLC preset option
- SDLC documentation (3 docs + 1 proposal)
- Architecture Decision Record (ADR)

### Out of Scope (next sprint)

- Ollama fallback from Anthropic (ADR-005 — deferred)
- Cross-team agent communication
- Conversation state persistence to disk
- SDLC-Orchestrator actual integration (proposal only)
- Ollama conversation memory / session continuity

---

## Task Breakdown

### Batch 1 — TypeScript Core (DONE)

| Task | File | Status |
|------|------|--------|
| Add `sdlc_role?: SdlcRole` to AgentConfig | `src/lib/types.ts` | Done |
| Add `system_prompt?`, `prompt_file?`, `project_directory?` | `src/lib/types.ts` | Done |
| Add `description?` to TeamConfig | `src/lib/types.ts` | Done |
| Add `providers.ollama.url` to Settings | `src/lib/types.ts` | Done |
| Add `OLLAMA_MODEL_IDS`, `SDLC_ROLES`, `SdlcRole` | `src/lib/types.ts` | Done |
| Add `resolveOllamaModel()` | `src/lib/config.ts` | Done |
| System prompt injection via `SYSTEM_CONTEXT.md` | `src/lib/invoke.ts` | Done |
| Ollama provider branch in `invokeAgent()` | `src/lib/invoke.ts` | Done |
| Role-specific template selection in `ensureAgentDirectory()` | `src/lib/agent-setup.ts` | Done |

### Batch 2 — Planning & Design Documents (IN PROGRESS)

| Task | File | Status |
|------|------|--------|
| Create ADR | `docs/02-design/adr-sdlc-framework-support.md` | Done |
| Update requirements with SDLC requirements | `docs/01-planning/requirements.md` | Done |
| Create sprint plan | `docs/01-planning/sprint-plan-sdlc-support.md` | In Progress |

### Batch 3 — Role Templates (PENDING)

| Task | File | Priority |
|------|------|----------|
| PM role template | `templates/agents/pm/AGENTS.md` | P0 |
| Architect role template | `templates/agents/architect/AGENTS.md` | P0 |
| Coder role template | `templates/agents/coder/AGENTS.md` | P0 |
| Reviewer role template | `templates/agents/reviewer/AGENTS.md` | P0 |
| Tester role template | `templates/agents/tester/AGENTS.md` | P0 |
| DevOps role template | `templates/agents/devops/AGENTS.md` | P0 |
| Default SDLC settings template | `templates/settings.sdlc-default.json` | P0 |

### Batch 4 — CLI & Setup (PENDING)

| Task | File | Priority |
|------|------|----------|
| `tinysdlc sdlc` command | `lib/sdlc.sh` | P1 |
| Register `sdlc` in dispatcher | `lib/common.sh` | P1 |
| Setup wizard SDLC preset | `lib/setup-wizard.sh` | P2 |

### Batch 5 — Documentation (PENDING)

| Task | File | Priority |
|------|------|----------|
| SDLC agent roles reference | `docs/01-planning/sdlc-agent-roles.md` | P1 |
| SDLC team archetypes design | `docs/02-design/sdlc-team-archetypes.md` | P1 |
| SDLC setup guide | `docs/04-build/sdlc-agent-setup-guide.md` | P1 |
| SDLC-Orchestrator proposal | `docs/03-integrate/sdlc-orchestrator-proposal.md` | P1 |

### Batch 6 — Build & Verify (PENDING)

| Task | Command | Acceptance |
|------|---------|------------|
| TypeScript compile | `npm run build` | 0 errors |
| Restart services | `./tinysdlc.sh restart` | All panes running |
| Verify SDLC init | `tinysdlc sdlc init` | Agents created |
| Verify roles listing | `tinysdlc sdlc roles` | Table displayed |
| End-to-end test | `@planning define X` via Telegram | pm responds |
| End-to-end test | `@dev implement Y` via Telegram | coder → reviewer |

---

## Definition of Done

- [ ] `npm run build` passes with 0 TypeScript errors
- [ ] `tinysdlc sdlc init` creates all 6 SDLC agents + 4 teams in `~/.tinysdlc/settings.json`
- [ ] New agent with `sdlc_role: 'pm'` gets role-specific AGENTS.md in its workspace
- [ ] Ollama agent responds when `provider: 'ollama'` and `OLLAMA_URL` is set
- [ ] All 4 documentation files created with SDLC headers
- [ ] ADR committed and linked from `docs/README.md`
- [ ] `docs/README.md` updated with new files

---

## Gate Checkpoint

**Target gate after this sprint**: G1 — Requirements Complete

G1 requires:
- Requirements document updated with SDLC Framework requirements ✓
- User stories cover all new functionality ✓
- ADR documents all architectural decisions ✓
- Sprint plan approved by CTO ✓
