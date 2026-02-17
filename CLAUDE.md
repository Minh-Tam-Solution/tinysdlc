# CLAUDE AI PROJECT CONTEXT — TinySDLC

**Version**: 0.1.0
**Status**: Active
**Last Updated**: 2026-02-17

---

## SDLC Compliance

This project follows **SDLC Enterprise Framework v6.0.6** at **LITE tier**.

| Aspect | Value |
| ------ | ----- |
| SDLC Framework | 6.0.6 |
| Tier | LITE (1-2 developers) |
| Config | `.sdlc-config.json` |
| Active Stages | 00-foundation, 01-planning, 02-design, 03-integrate, 04-build |
| Current Gate | G0.1 |
| Framework Reference | `.sdlc-framework/` (local copy, gitignored) |

### Documentation Standards

- All docs follow the `docs/NN-stage/` folder structure
- Document names use **kebab-case** (no sprint numbers, dates, or versions in filenames)
- Documents include SDLC headers (SDLC Version, Stage, Status, Authority)
- See `docs/README.md` for full documentation index

### When Creating New Documents

1. Place in the correct stage folder (`docs/00-foundation/` through `docs/04-build/`)
2. Use feature-based naming: `feature-description.md` (kebab-case)
3. Add the SDLC header template at the top:

   ```markdown
   # TinySDLC - [Title]
   **SDLC Version**: 6.0.6
   **Stage**: NN - STAGE_NAME
   **Status**: Active
   **Authority**: CTO Approved
   ```

4. Forbidden in filenames: sprint numbers, dates, versions, team names, person names

---

## Project Overview

TinySDLC is a **multi-agent, multi-team, multi-channel 24/7 AI assistant orchestrator** that integrates the SDLC Enterprise Framework v6.0.6 for AI+Human team governance. It runs AI agents (Claude Code CLI, OpenAI Codex CLI, or Ollama) organized into teams with SDLC roles (PM, Architect, Coder, Reviewer, Tester, DevOps). Messages arrive from Discord, WhatsApp, and Telegram through a file-based queue system with atomic operations. Agents collaborate via `[@teammate: message]` tags, enabling chain execution and parallel fan-out within teams.

The project is a fork of [TinyClaw](https://github.com/jlia0/tinyclaw) by jlia0, combined with SDLC Enterprise Framework v6.0.6 by Minh-Tam-Solution to create a governance-aware agent orchestration platform.

**Repository**: [Minh-Tam-Solution/tinysdlc](https://github.com/Minh-Tam-Solution/tinysdlc)

---

## Tech Stack

- **Language**: TypeScript 5.9 (strict mode, ES2020 target) + Bash 4.0+
- **Runtime**: Node.js 14+
- **Session Manager**: tmux
- **Channels**: discord.js 14, whatsapp-web.js 1.34, node-telegram-bot-api 0.67
- **TUI Dashboard**: React 19 + Ink 6 (separate ESM build)
- **Utilities**: jsonrepair (auto-fix corrupted JSON), dotenv, qrcode-terminal
- **AI Providers**: Claude Code CLI (Anthropic), Codex CLI (OpenAI), Ollama (local REST API)
- **Build**: TypeScript compiler with 2 configs — `tsconfig.json` (CommonJS) + `tsconfig.visualizer.json` (ESM/NodeNext)

---

## Quick Start

```bash
git clone https://github.com/Minh-Tam-Solution/tinysdlc.git
cd tinysdlc
npm install
npm run build
./tinysdlc.sh start    # Runs interactive setup wizard on first launch
```

After setup, optionally apply SDLC team configuration:

```bash
tinysdlc sdlc init     # Creates 6 agents + 4 teams with SDLC roles
```

**Testing**: Manual only — `./tinysdlc.sh start` then verify all tmux panes are running. There is no `npm test` or linter configured.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     Message Channels                        │
│         (Discord, Telegram, WhatsApp, Heartbeat)            │
└────────────────────┬────────────────────────────────────────┘
                     │ Write message.json
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   ~/.tinysdlc/queue/                         │
│                                                             │
│  incoming/          processing/         outgoing/           │
│  ├─ msg1.json  →   ├─ msg1.json   →   ├─ msg1.json        │
│  ├─ msg2.json       └─ msg2.json       └─ msg2.json        │
│  └─ msg3.json                                               │
└────────────────────┬────────────────────────────────────────┘
                     │ Queue Processor (polls 1s)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Parallel Processing by Agent                    │
│                                                             │
│  Agent: coder        Agent: reviewer      Agent: pm         │
│  ┌──────────┐       ┌──────────┐        ┌──────────┐       │
│  │ Message 1│       │ Message 1│        │ Message 1│       │
│  │ Message 2│ seq   │          │  seq   │          │ seq   │
│  └────┬─────┘       └────┬─────┘        └────┬─────┘       │
│       │                  │                    │             │
└───────┼──────────────────┼────────────────────┼─────────────┘
        ↓                  ↓                    ↓
   claude CLI         claude CLI           claude CLI
  (workspace/coder)  (workspace/reviewer) (workspace/pm)
```

**Key features**: File-based queue (atomic `renameSync`), parallel across agents, sequential per agent, isolated workspaces per agent.

---

## Key Decisions (Top 5)

1. **File-based queue** instead of Redis/RabbitMQ — zero external dependencies, atomic file renames prevent race conditions
2. **Atomic `renameSync`** for message flow — incoming → processing → outgoing transitions are crash-safe
3. **Optional `sdlc_role?` field** in AgentConfig — backward compatible, existing users unaffected
4. **`SYSTEM_CONTEXT.md` injection** for custom prompts — written to agent workspace, not embedded in user message (preserves SE4H intent)
5. **Dual tsconfig** (CommonJS + ESM) — main code uses CommonJS, React/Ink visualizer requires ESM with NodeNext resolution

---

## Common Tasks (Top 10)

| # | Task | Command | Key File |
| - | ---- | ------- | -------- |
| 1 | Start/stop daemon | `./tinysdlc.sh start\|stop` | `tinysdlc.sh` |
| 2 | Add new agent | `tinysdlc agent add` | `lib/agents.sh` |
| 3 | Add new team | `tinysdlc team add` | `lib/teams.sh` |
| 4 | Apply SDLC defaults | `tinysdlc sdlc init` | `lib/sdlc.sh` |
| 5 | View logs | `tinysdlc logs all` | `~/.tinysdlc/logs/` |
| 6 | Monitor team chains | `tinysdlc team visualize dev` | `src/visualizer/team-visualizer.tsx` |
| 7 | Build TypeScript | `npm run build` | `tsconfig.json`, `tsconfig.visualizer.json` |
| 8 | Approve sender | `tinysdlc pairing approve CODE` | `src/lib/pairing.ts` |
| 9 | Reset agent conversation | `tinysdlc agent reset <id>` | `lib/agents.sh` |
| 10 | Check SDLC status | `tinysdlc sdlc status` | `lib/sdlc.sh` |

---

## Key TypeScript Modules

- `src/queue-processor.ts` — Central message processing loop (612 lines). Polls queue, routes to agents, handles team conversations, writes responses to outgoing.
- `src/lib/types.ts` — All interfaces: `AgentConfig`, `TeamConfig`, `Settings`, `SdlcRole`, `QueueMessage`. The `SDLC_ROLES` constant defines valid roles.
- `src/lib/config.ts` — Settings loader (`getSettings()`), path constants (`QUEUE_DIR`, `EVENTS_DIR`), model resolution (`resolveClaudeModel()`). Hot-reloads on every message.
- `src/lib/invoke.ts` — Agent process spawning per provider: Anthropic (`claude` CLI), OpenAI (`codex exec`), Ollama (HTTP to `/api/chat`). Handles `SYSTEM_CONTEXT.md` injection and 15-min timeout.
- `src/lib/routing.ts` — Message routing: `parseAgentRouting()` resolves `@agent_id` and `@team_id` mentions. `extractTeammateMentions()` parses `[@teammate: message]` tags for chain execution.
- `src/lib/pairing.ts` — Sender allowlist/pairing code system. Generates 8-char codes, stores in `pairing.json`.
- `src/lib/agent-setup.ts` — Agent workspace initialization: copies `.claude/`, `AGENTS.md` (role-specific if `sdlc_role` set), symlinks skills, creates `.tinysdlc/SOUL.md`.
- `src/lib/logging.ts` — Structured JSON events to `~/.tinysdlc/events/` for real-time visualizer consumption.
- `src/channels/discord-client.ts` — Discord DM listener, attachment download (50MB limit), message splitting (2000 char limit).
- `src/channels/telegram-client.ts` — Telegram Bot API integration, callback query handling.
- `src/channels/whatsapp-client.ts` — WhatsApp Web.js integration, QR code auth.
- `src/visualizer/team-visualizer.tsx` — React/Ink TUI dashboard showing real-time team conversation chains, agent status, and activity log.

---

## Dual-Language Codebase

- **TypeScript** (`src/`): Message processing, channel clients, agent invocation, routing, pairing, config, visualizer
- **Bash** (`lib/`): Daemon lifecycle (tmux), CLI commands, setup wizard, agent/team CRUD, SDLC commands, heartbeat cron, update mechanism

---

## Architecture Details

### File-Based Message Queue

The central pattern. All messages flow through `~/.tinysdlc/queue/`:

- `incoming/` → `processing/` → `outgoing/` (atomic renames via `fs.renameSync`)
- Queue processor (`src/queue-processor.ts`) polls every 1s, processes agents in parallel but messages per-agent sequentially via promise chains

### Channel Client Pattern

Each channel (`src/channels/{discord,telegram,whatsapp}-client.ts`) follows the same pattern:

1. Listen for DMs → apply sender pairing check → write JSON to `queue/incoming/`
2. Poll `queue/outgoing/` every 1s → deliver responses (splitting long messages, file attachments)

To add a new channel: create `src/channels/<name>-client.ts`, then add the channel ID and fill in `CHANNEL_*` registry arrays in `lib/common.sh`.

### Agent Invocation

`src/lib/invoke.ts` spawns CLI processes per provider:

- **Anthropic**: `claude --dangerously-skip-permissions -c -p <message>`
- **OpenAI**: `codex exec ... --dangerously-bypass-approvals-and-sandbox --json`
- **Ollama**: HTTP POST to `/api/chat` endpoint (configurable URL via `providers.ollama.url`)

Each agent gets an isolated workspace directory with `.claude/`, `AGENTS.md`, `.tinysdlc/SOUL.md`.

### Team Conversations

Agents communicate via `[@teammate: message]` tags parsed by `src/lib/routing.ts`. Messages generate internal queue entries. A `Conversation` object tracks pending branches (max 50 messages to prevent loops). Supports parallel fan-out to multiple teammates.

### Configuration

- Primary config: `~/.tinysdlc/settings.json` (auto-repaired via `jsonrepair` if corrupted)
- `TINYSDLC_HOME` env var overrides data directory; falls back to local `.tinysdlc/` then `~/.tinysdlc/`
- Settings are re-read on every message for hot-reload

### Runtime

Runs inside a `tmux` session ("tinysdlc") with panes for each enabled channel, queue processor, heartbeat cron, and log tailing. Auto-builds TypeScript on start if source is newer than compiled output.

### TypeScript Configuration

Two tsconfig files: `tsconfig.json` (CommonJS, ES2020, strict) for main code, and `tsconfig.visualizer.json` (ESM/NodeNext, react-jsx) for the Ink visualizer. The visualizer output gets `{"type":"module"}` injected during build.

---

## SDLC Agent Roles

TinySDLC supports 6 SDLC roles assigned via `sdlc_role` field in agent config:

| Role | SDLC Stages | Gate Ownership | Key Constraint |
| ---- | ----------- | -------------- | -------------- |
| **pm** | 00-01 | G0.1, G1 | Plans only, never writes code |
| **architect** | 02-03 | G2 | Designs systems, defines contracts |
| **coder** | 04 | Sprint Gate | Implements features, writes tests |
| **reviewer** | 04-05 | G3 (primary) | Reviews code quality, blocks bad merges |
| **tester** | 05 | G3 (co-owner) | Validates quality, writes test cases |
| **devops** | 06-07 | G4 | Manages deployment and infrastructure |

Role templates: `templates/agents/{role}/AGENTS.md`
Default SDLC settings: `templates/settings.sdlc-default.json`
CLI: `tinysdlc sdlc init` applies all 6 agents + 4 team archetypes (planning, dev, qa, fullstack)

---

## Constraints

- **No test suite** — manual testing only via `./tinysdlc.sh start`
- **No linter** configured
- **Agent timeout**: 15 minutes max per invocation
- **Conversation loop cap**: 50 messages max per team conversation (prevents infinite loops)
- **File download limit**: 50MB (Discord/Telegram attachments)
- **Ollama stateless**: No conversation memory between invocations (each call is independent)
- **Cross-team communication**: Not yet implemented (agents cannot mention agents from other teams)
- **Path validation**: `validatePath()` in `invoke.ts` prevents directory traversal (SEC-003)
