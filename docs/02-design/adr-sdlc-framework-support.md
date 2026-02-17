# TinySDLC - ADR: SDLC Framework v6.0.6 Support

**SDLC Version**: 6.0.6
**Stage**: 02 - DESIGN
**Status**: Active
**Authority**: CTO Approved
**Date**: 2026-02-16

---

## Context

TinySDLC is a multi-agent orchestrator that runs AI agents via messaging channels (Telegram, Discord, WhatsApp). Currently it has no concept of SDLC roles, stages, or quality gates. Any user who wants to apply SDLC Framework v6.0.6 must manually configure agents from scratch without guidance or tooling.

**Problem**: TinySDLC cannot be used as an SDLC-aligned development platform out of the box. Users familiar with SDLC Framework v6.0.6 have no standardized way to map agents to SDLC roles, configure stage-specific behavior, or enforce SE4A/SE4H boundaries.

---

## Decision

We will add native SDLC Framework v6.0.6 support to TinySDLC through:

1. **Typed agent roles** (`sdlc_role` field in `AgentConfig`)
2. **System prompt injection** via `SYSTEM_CONTEXT.md` in each agent's working directory
3. **Role-specific AGENTS.md templates** for the 6 core SDLC roles
4. **Default settings template** with pre-configured SDLC agents and teams
5. **CLI command** (`tinysdlc sdlc`) for SDLC-aware operations
6. **Ollama provider support** for local/private model deployments
7. **Proposal document** for SDLC-Orchestrator team integration (separate deliverable)

---

## Architectural Decisions

### ADR-001: sdlc_role as Typed Field in AgentConfig

**Decision**: Add `sdlc_role?: SdlcRole` as an optional TypeScript field in `AgentConfig`.

**Rationale**: Making it optional preserves full backward compatibility. Existing configurations without `sdlc_role` continue to work unchanged. Using the `SdlcRole` type (instead of `string`) provides compile-time enforcement of valid role names.

**Alternatives considered**:
- Store SDLC role in AGENTS.md only → not machine-readable, cannot be used for routing or template selection
- Separate SDLC config file → extra complexity, duplication with settings.json

**Trade-offs**: Slight coupling between settings.json schema and SDLC Framework roles. Acceptable since framework version is tracked.

---

### ADR-002: System Prompt via SYSTEM_CONTEXT.md File (Not Message Injection)

**Decision**: When `system_prompt` or `prompt_file` is set in `AgentConfig`, write content to `SYSTEM_CONTEXT.md` in the agent's working directory. Claude CLI picks this up via `.claude/CLAUDE.md` context. **Do not inject into the user message**.

**Rationale**: Injecting system context into the user message pollutes the SE4H intent signal. Claude CLI reads all markdown files in the working directory as context. Writing to a file is persistent across conversations and doesn't interfere with the `[-c]` (continue) flag.

**Alternatives considered**:
- Prepend to user message: pollutes SE4H intent, visible in conversation history
- Pass via `--system` flag: Claude CLI does not support a `--system` flag directly
- Store in AGENTS.md: AGENTS.md is overwritten by `updateAgentTeammates()` on each invocation

**Trade-offs**: Requires that `.claude/CLAUDE.md` reference the context file. The file is updated on every `invokeAgent()` call.

---

### ADR-003: Role-Specific AGENTS.md Templates

**Decision**: Create `templates/agents/{role}/AGENTS.md` for each of the 6 SDLC roles. `ensureAgentDirectory()` uses the role-specific template if `agent.sdlc_role` is set and the template exists.

**Rationale**: Each SDLC role has different responsibilities, forbidden actions, and communication patterns. A generic template cannot convey role-specific SE4A constraints. Role-specific templates allow agents to understand their SDLC position without additional configuration.

**Alternatives considered**:
- Single template with role-specific sections: harder to maintain, agent receives irrelevant sections
- Runtime prompt injection per role: requires system prompt on every call, more complex

**Trade-offs**: 6 additional files to maintain. Template applies only to new agent directories (not existing ones — re-apply via `tinysdlc sdlc init`).

---

### ADR-004: Ollama Provider for Local/Private Models

**Decision**: Add `ollama` as a third provider in `AgentConfig.provider`. Invoke via REST API at configurable URL (env var `OLLAMA_URL` or `settings.providers.ollama.url`).

**Rationale**: Enterprise SDLC deployments often require data privacy and cannot use cloud APIs. Local Ollama instances (or company-hosted Ollama like `https://api.nhatquangholding.com`) provide this. Ollama's API is simple REST — no CLI dependency required.

**Known limitation**: Ollama has no conversation memory equivalent to Claude's `-c` flag. Each call is stateless. Acceptable for SE4A agents which primarily respond to single-task messages.

**Alternatives considered**:
- Ollama CLI (`ollama run`): less control over error handling and response format
- OpenAI-compatible endpoint with different base URL: Ollama's native `/api/chat` format is simpler

**Priority lookup**: `OLLAMA_URL` env var → `settings.providers.ollama.url` → `http://localhost:11434`

---

### ADR-005: Ollama Fallback from Anthropic (Future)

**Decision**: When `provider: 'anthropic'` fails with an API error (network, quota, auth), optionally fall back to Ollama if `settings.providers.ollama.fallback_enabled` is `true`.

**Status**: Deferred — design approved, implementation in next sprint.

**Rationale**: SDLC LITE tier environments may have intermittent cloud connectivity. A local fallback ensures agent availability without manual intervention.

---

### ADR-006: teams.fullstack Uses pm as Leader (Not assistant)

**Decision**: The `fullstack` default team uses `pm` agent as leader, not `assistant`.

**Rationale**: TinySDLC routes any unrouted message (no `@prefix`) to the `default` agent. If `assistant` is both the default agent and a team leader, all unrouted messages would trigger the fullstack team conversation — incorrect behavior. `pm` as leader correctly scopes team activation to explicit `@fullstack` routing.

---

### ADR-007: qa Team is Required for G3 Gate

**Decision**: Document the `qa` team as **required** (not optional) when a project targets Gate G3 Ship Ready.

**Rationale**: SDLC Framework v6.0.6 Gate G3 requires test validation. Without the `qa` team (tester + reviewer), G3 cannot be validated by agents. Marking it optional creates ambiguity.

---

## Consequences

### Positive
- Any TinySDLC user familiar with SDLC Framework v6.0.6 can set up a compliant multi-agent environment with `tinysdlc sdlc init`
- TypeScript compile-time enforcement of SDLC roles prevents configuration errors
- SYSTEM_CONTEXT.md approach enables rich role context without modifying routing code
- Ollama support enables data-sovereign deployments

### Negative / Risks
- `ensureAgentDirectory()` only applies templates to new agent directories. Existing agents require `tinysdlc sdlc init --reinit` (planned for next sprint)
- Ollama has no conversation continuity — stateless per-call behavior may reduce coherence for long tasks
- SYSTEM_CONTEXT.md must be referenced in `.claude/CLAUDE.md` template — needs verification

### Out of Scope (this ADR)
- Cross-team agent communication (requires routing.ts changes — ADR to be created)
- Conversation persistence to disk (requires queue-processor.ts changes — ADR to be created)
- SDLC-Orchestrator integration (separate proposal document — `docs/03-integrate/sdlc-orchestrator-proposal.md`)

---

## Implementation Reference

| Component | File | Change |
|-----------|------|--------|
| Types | `src/lib/types.ts` | Added `sdlc_role?: SdlcRole`, `system_prompt?`, `prompt_file?`, `project_directory?`, `providers.ollama.url` |
| Config | `src/lib/config.ts` | Added `resolveOllamaModel()` |
| Invocation | `src/lib/invoke.ts` | System prompt injection + Ollama provider branch |
| Agent setup | `src/lib/agent-setup.ts` | Role-specific AGENTS.md template selection |
| Templates | `templates/agents/{role}/AGENTS.md` | 6 role templates (to be created) |
| Settings | `templates/settings.sdlc-default.json` | Default SDLC configuration (to be created) |
| CLI | `lib/sdlc.sh` | `tinysdlc sdlc` command (to be created) |
