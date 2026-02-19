# TinySDLC - Requirements

**SDLC Version**: 6.1.0
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
- Zalo OA messages (via Zalo Bot Platform API)
- Zalo Personal messages (via zca-cli)
- Unified message format across all channels
- File exchange (incoming/outgoing) for all channels
- Plugin-based channel architecture for extensibility

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

## SDLC Framework v6.1.0 Requirements

Added: 2026-02-16 — Gate G0.1 approved

### SDLC Role Support (SE4A/SE4H Model)

- Agents must be configurable with SDLC roles: `researcher`, `pm`, `pjm`, `architect`, `coder`, `reviewer`, `tester`, `devops`
- Role assignment via optional `sdlc_role` field in agent config (backward compatible)
- Role-specific AGENTS.md templates encode SE4A constraints, stage responsibilities, and quality gate ownership
- Multi-provider model assignment: Opus (deep reasoning), GPT 5.2 (precise analysis), Sonnet (fast execution)
- System prompt injection via `SYSTEM_CONTEXT.md` — does NOT pollute user message (SE4H intent preserved)

### SDLC-Aligned Default Teams

- Four pre-configured team archetypes:
  - `planning` (researcher + pm + pjm + architect — Stage 00-01, Gates G0.1, G1)
  - `dev` (coder + reviewer — Stage 04-05, Sprint Gate)
  - `qa` (tester + reviewer — Stage 05, required for G3)
  - `fullstack` (researcher + pm + pjm + architect + coder + reviewer — LITE tier, all stages)
- Default settings template (`templates/settings.sdlc-default.json`) enables one-command SDLC setup
- Setup wizard must offer SDLC preset option during initial configuration

### Multi-Provider Support

- Support Anthropic (Claude CLI), OpenAI (Codex CLI), and Ollama (local/company-hosted models)
- Ollama URL configurable via env var `OLLAMA_URL` or `settings.providers.ollama.url`
- Company Ollama infrastructure at `https://api.nhatquangholding.com` must be supported
- Future: Anthropic → Ollama fallback when cloud API unavailable

### CLI SDLC Commands

- `tinysdlc sdlc status` — show agents with their SDLC roles and active teams
- `tinysdlc sdlc init` — apply SDLC default template (8 agents + 4 teams) to settings.json
- `tinysdlc sdlc roles` — list role-to-stage-to-gate mapping

### Workspace Management

- `/workspace add <alias> <path>` — register a project workspace (path must be within $HOME)
- `/workspace add <alias> <path> --external` — register a workspace outside $HOME (opt-in for shared directories)
- `/workspace list` — list registered project workspaces
- `/workspace switch <alias>` — switch active project workspace
- SEC-003: Path validation prevents directory traversal; `--external` flag required for paths outside $HOME

### SDLC User Stories

1. As an SDLC practitioner, I want to assign SDLC roles (12 roles: 8 SE4A + 3 SE4H + 1 Router) to agents so they behave according to SE4A constraints
2. As a project manager, I want a pre-configured SDLC team setup (8 agents + 4 teams) available with one command
3. As a DevOps engineer, I want to use company-hosted Ollama models for data-sovereign agent deployments
4. As a CTO, I want the `qa` team to be required (not optional) when targeting Gate G3 Ship Ready
5. As a researcher, I want a dedicated agent with Opus model for deep research and evidence gathering
6. As a project manager, I want a dedicated PJM agent to track sprint execution and timelines
7. As a user in Vietnam, I want to message agents via Zalo OA and Zalo Personal
8. As a developer, I want to register project workspaces outside $HOME using `--external` flag

---

## Ecosystem Upgrade Requirements (CTO-2026-002)

Added: 2026-02-17 — CTO Directive CTO-2026-002 approved

### Shell Safety Guards (P0 — Non-Negotiable)

- CLI commands executed by agents MUST be checked against deny patterns before execution
- 8 minimum deny patterns: rm -rf, fork bomb, mkfs, dd device overwrite, device write, shutdown/reboot, chmod 777, curl|sh
- Path traversal outside agent workspace MUST be blocked
- Guard enabled by default, configurable per agent via `shell_guard_enabled`

### FailoverError Classification (P1)

- Provider errors MUST be classified into categories: auth, format, rate_limit, billing, timeout, unknown
- Each category has a defined action: ABORT, FALLBACK, or RETRY
- Retryable errors (rate_limit, timeout) trigger fallback to next provider
- Non-retryable errors (auth, billing) abort immediately with structured error log

### Delegation Depth Guard (P1 — Non-Negotiable)

- Agent-to-agent delegation MUST track depth via `delegation_depth` in message metadata
- Max depth configurable per agent via `max_delegation_depth` (default: 1)
- Exceeding max depth returns error to originating agent instead of routing
- 50-message conversation cap remains as secondary safety net
- `correlation_id` propagated through all messages in a delegation chain

### Canonical Protocol Compliance (P0 — Blocked on ADR-056)

- TinySDLC MUST support the Orchestrator's canonical message protocol when integration is enabled
- Protocol adapter converts between internal `QueueMessage` and `CanonicalAgentMessage` formats
- Adapter gated by `orchestrator_integration.enabled` config flag (default: false)
- TinySDLC does NOT define protocol extensions without CTO approval

### Plugin-Based Channel Architecture (P1)

- Common channel behavior MUST be extracted into a `ChannelPlugin` interface
- Existing channels (Discord, Telegram, WhatsApp) refactored as plugins
- New channels can be added as plugins with zero core changes
- Plugin loader discovers enabled channels from settings.json

### Config Snapshot Precedence (Non-Negotiable)

- Agent config MUST be snapshotted at conversation-start
- Hot-reload config mid-conversation only applies to NEW conversations
- Running conversations use the snapshot from their start

### External Content Sanitization (Non-Negotiable)

- All user input from OTT channels MUST be sanitized before agent context injection
- Strip prompt injection patterns: system prompt overrides, role-switching commands, delimiter injection

### Ecosystem Upgrade User Stories

1. As a security engineer, I want agents to be blocked from executing destructive shell commands
2. As a developer, I want provider errors classified so the system can auto-retry or fallback intelligently
3. As an architect, I want delegation depth limits to prevent infinite agent-to-agent chains
4. As an integrator, I want TinySDLC to speak the Orchestrator's canonical protocol when connected
5. As a developer, I want to add new messaging channels as plugins without modifying core code
6. As a security engineer, I want OTT channel input sanitized against prompt injection attacks

---

## ZeroClaw Security & UX Requirements (S04)

Added: 2026-02-19 — CTO Conditional Approval (2 fixes applied)

Reference: [ADR: ZeroClaw Security Patterns](../02-design/adr-zeroclaw-security-patterns.md)

### Credential Scrubbing (P0 — Pattern A)

- User messages from OTT channels MUST be scanned for credential patterns before agent delivery
- 11 minimum credential patterns: AWS keys, GitHub tokens, Slack tokens, Anthropic keys, OpenAI keys, generic API key assignments, bearer tokens, connection strings, PEM private keys, password fields
- Detected credentials MUST be replaced with `[REDACTED]` placeholders
- Scrubbing MUST log credential types found (for audit) but NOT log the actual credential values
- Configurable via `credential_scrubbing_enabled` (default: true)
- Internal agent-to-agent messages are exempt (already within trust boundary)

### Environment Scrubbing (P0 — Pattern C)

- Sensitive environment variables MUST be removed from child processes before spawning AI CLIs
- 20+ exact var names (API keys, tokens, passwords, cloud credentials) plus 8 suffix patterns (`*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `*_PASS`, `*_API_KEY`, `*_PRIVATE_KEY`, `*_CREDENTIAL`, `*_CREDENTIALS`)
- Provider authentication keys MUST be preserved: `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `CODEX_API_KEY`
- Runtime essentials MUST be preserved: `PATH`, `HOME`, `NODE_ENV`, `TINYSDLC_HOME`, `OLLAMA_URL`
- Always-on (no config toggle); `PRESERVE_LIST` is the escape hatch

### ~~Query Classification (P1 — Pattern E)~~ — CANCELLED

~~Cancelled per CTO over-engineering audit — not required for LITE tier. Future enhancement for STANDARD+ if needed.~~

### Processing Status Indicators (P1 — Pattern F)

- Channel clients SHOULD display progress feedback during agent processing
- Queue processor writes status files to `queue/status/` before agent invocation
- Channel clients poll status directory and send updates every 30s for tasks running >15s
- Elapsed time MUST be computed client-side (`Date.now() - startedAt`), NOT read from stale file
- Status files cleaned up after agent response received
- Configurable via `processing_status_enabled` (default: true)

### ~~History Compaction (P2 — Pattern B)~~ — CANCELLED

~~Cancelled per CTO over-engineering audit — premature optimization for LITE tier. The 50-message conversation cap is sufficient.~~

### ZeroClaw User Stories

1. As a user, I want my accidentally pasted API keys to be automatically redacted before reaching AI agents
2. As a security engineer, I want agent subprocesses to not inherit my shell's GitHub token or database password
3. ~~As a developer, I want incoming messages classified so I can see analytics on query types~~ — CANCELLED (Pattern E)
4. As a user, I want to see progress feedback when my agent is processing a long request
5. ~~As a team lead, I want long team conversations to automatically compact older messages to stay efficient~~ — CANCELLED (Pattern B)
