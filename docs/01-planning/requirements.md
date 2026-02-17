# TinySDLC - Requirements

**SDLC Version**: 6.0.6
**Stage**: 01 - PLANNING
**Status**: Active
**Authority**: CTO Approved

---

## Core Requirements

### Multi-Agent Management
- Run multiple AI agents simultaneously with isolated workspaces
- Each agent has independent configuration (provider, model, system prompt)
- Route messages to specific agents via `@agent_id` syntax
- Default agent fallback when no routing prefix

### Multi-Channel Support
- Discord direct messages
- WhatsApp messages (via WhatsApp Web.js)
- Telegram messages (via Bot API)
- Unified message format across all channels
- File exchange (incoming/outgoing) for all channels

### Team Collaboration
- Agent-to-agent communication via `[@teammate: message]` tags
- Parallel fan-out to multiple teammates
- Conversation tracking with loop prevention (max 50 messages)
- Shared context delivery for multi-agent messages

### Queue System
- File-based message queue (no external dependencies)
- Atomic operations via `fs.renameSync`
- States: `incoming/` -> `processing/` -> `outgoing/`
- Parallel agent processing, sequential per-agent message handling

### Runtime
- tmux-based persistent sessions
- Auto-build TypeScript on start
- Heartbeat monitoring
- Hot-reload configuration (re-read on every message)

## User Stories

1. As a developer, I want to start a multi-agent setup with one command (`tinysdlc start`)
2. As a user, I want to message my AI assistant from Discord, WhatsApp, or Telegram
3. As a user, I want to route messages to specific agents using `@agent` syntax
4. As a developer, I want agents to collaborate by tagging teammates
5. As a developer, I want to add new channels without modifying core logic
6. As a user, I want agents to handle file attachments (images, documents)
7. As a developer, I want per-agent provider and model configuration
8. As a user, I want a pairing system to control who can access my agents

---

## SDLC Framework v6.0.6 Requirements

*Added: 2026-02-16 — Gate G0.1 approved*

### SDLC Role Support (SE4A/SE4H Model)
- Agents must be configurable with SDLC roles: `pm`, `architect`, `coder`, `reviewer`, `tester`, `devops`
- Role assignment via optional `sdlc_role` field in agent config (backward compatible)
- Role-specific AGENTS.md templates encode SE4A constraints, stage responsibilities, and quality gate ownership
- System prompt injection via `SYSTEM_CONTEXT.md` — does NOT pollute user message (SE4H intent preserved)

### SDLC-Aligned Default Teams
- Four pre-configured team archetypes: `planning` (Stage 00-01), `dev` (Stage 04-05), `qa` (Stage 05, required for G3), `fullstack` (LITE tier)
- Default settings template (`templates/settings.sdlc-default.json`) enables one-command SDLC setup
- Setup wizard must offer SDLC preset option during initial configuration

### Multi-Provider Support
- Support Anthropic (Claude CLI), OpenAI (Codex CLI), and Ollama (local/company-hosted models)
- Ollama URL configurable via env var `OLLAMA_URL` or `settings.providers.ollama.url`
- Company Ollama infrastructure at `https://api.nhatquangholding.com` must be supported
- Future: Anthropic → Ollama fallback when cloud API unavailable

### CLI SDLC Commands
- `tinysdlc sdlc status` — show agents with their SDLC roles and active teams
- `tinysdlc sdlc init` — apply SDLC default template to settings.json
- `tinysdlc sdlc roles` — list role-to-stage-to-gate mapping

### SDLC User Stories
9. As an SDLC practitioner, I want to assign SDLC roles to agents so they behave according to SE4A constraints
10. As a project manager, I want a pre-configured SDLC team setup available with one command
11. As a DevOps engineer, I want to use company-hosted Ollama models for data-sovereign agent deployments
12. As a CTO, I want the `qa` team to be required (not optional) when targeting Gate G3 Ship Ready
