# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## SDLC Compliance

This project follows **SDLC Enterprise Framework v6.0.6** at **LITE tier**.

| Aspect | Value |
|--------|-------|
| SDLC Framework | 6.0.6 |
| Tier | LITE (1-2 developers) |
| Config | `.sdlc-config.json` |
| Active Stages | 00-foundation, 01-planning, 02-design, 03-integrate, 04-build |
| Current Gate | G0.1 |
| Framework Reference | `.sdlc-framework` (local symlink, gitignored) |

### Documentation Standards

- All docs follow the `docs/NN-stage/` folder structure
- Document names use **kebab-case** (no sprint numbers, dates, or versions in filenames)
- Documents include SDLC headers (SDLC Version, Stage, Status, Authority)
- See `docs/README.md` for full documentation index

### When Creating New Documents

1. Place in the correct stage folder (`docs/00-foundation/` through `docs/04-build/`)
2. Use feature-based naming: `feature-description.md` (kebab-case)
3. Add the SDLC header template at the top
4. Forbidden in filenames: sprint numbers, dates, versions, team names, person names

## Build & Run

```bash
npm install              # Install dependencies
npm run build            # Compile all TypeScript (main + visualizer)
npm run build:main       # Compile only main TypeScript
npm run build:visualizer # Compile only visualizer (React/Ink TUI)

./tinyclaw.sh start      # Build (if needed) and launch tmux session
./tinyclaw.sh restart    # Restart all services
./tinyclaw.sh stop       # Stop tmux session
./tinyclaw.sh logs all   # Tail all log files
```

There is no test suite or linter configured. Testing is manual via `./tinyclaw.sh start`.

## Architecture

TinySDLC is a multi-agent, multi-channel AI assistant orchestrator. It runs AI agents (Claude Code CLI / OpenAI Codex CLI) in teams that process messages from Discord, WhatsApp, and Telegram through a file-based queue.

### Dual-Language Codebase

- **TypeScript** (`src/`): Message processing, channel clients, agent invocation, routing
- **Bash** (`lib/`): Daemon lifecycle (tmux), CLI commands, setup wizard, agent/team CRUD

### File-Based Message Queue

The central pattern. All messages flow through `~/.tinyclaw/queue/`:
- `incoming/` → `processing/` → `outgoing/` (atomic renames via `fs.renameSync`)
- Queue processor (`src/queue-processor.ts`) polls every 1s, processes agents in parallel but messages per-agent sequentially via promise chains

### Channel Client Pattern

Each channel (`src/channels/{discord,telegram,whatsapp}-client.ts`) follows the same pattern:
1. Listen for DMs → apply sender pairing check → write JSON to `queue/incoming/`
2. Poll `queue/outgoing/` every 1s → deliver responses (splitting long messages, file attachments)

To add a new channel: create `src/channels/<name>-client.ts`, then add the channel ID and fill in `CHANNEL_*` registry arrays in `lib/common.sh`.

### Agent Invocation

`src/lib/invoke.ts` spawns CLI processes per provider:
- **Anthropic**: `claude --dangerously-skip-permissions`
- **OpenAI**: `codex exec ... --dangerously-bypass-approvals-and-sandbox`

Each agent gets an isolated workspace directory with `.claude/`, `AGENTS.md`, `SOUL.md`.

### Team Conversations

Agents communicate via `[@teammate: message]` tags parsed by `src/lib/routing.ts`. Messages generate internal queue entries. A `Conversation` object tracks pending branches (max 50 messages to prevent loops). Supports parallel fan-out to multiple teammates.

### Configuration

- Primary config: `~/.tinyclaw/settings.json` (auto-repaired via `jsonrepair` if corrupted)
- `TINYSDLC_HOME` env var overrides data directory; falls back to local `.tinyclaw/` then `~/.tinyclaw/`
- Settings are re-read on every message for hot-reload

### Runtime

Runs inside a `tmux` session ("tinyclaw") with panes for each enabled channel, queue processor, heartbeat cron, and log tailing. Auto-builds TypeScript on start if source is newer than compiled output.

### Key TypeScript Modules

- `src/queue-processor.ts` — Central message processing loop
- `src/lib/types.ts` — All interfaces and type definitions
- `src/lib/config.ts` — Settings loader, path constants, model resolution
- `src/lib/invoke.ts` — Agent process spawning
- `src/lib/routing.ts` — Message routing and `@agent`/`@team` parsing
- `src/lib/pairing.ts` — Sender allowlist/pairing code system
- `src/visualizer/team-visualizer.tsx` — React/Ink TUI dashboard (separate ESM build)

### TypeScript Configuration

Two tsconfig files: `tsconfig.json` (CommonJS, ES2020, strict) for main code, and `tsconfig.visualizer.json` (ESM/NodeNext, react-jsx) for the Ink visualizer. The visualizer output gets `{"type":"module"}` injected during build.
