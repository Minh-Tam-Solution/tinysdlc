# TinySDLC

Multi-agent AI Orchestrator with SDLC Governance.
Run teams of AI agents across Discord, WhatsApp, and Telegram — governed by SDLC Framework v6.0.6 roles and quality gates.

---

## Overview

TinySDLC connects messaging channels to AI agents through a file-based message queue. Agents are organized into teams with SDLC roles — PM, Architect, Coder, Reviewer, Tester, DevOps — and collaborate via chain execution and parallel fan-out.

Three AI providers are supported: Anthropic Claude, OpenAI Codex, and Ollama (local models). Each agent operates in an isolated workspace with its own conversation history, role-specific instructions, and configuration.

---

## Install

### Prerequisites

- macOS or Linux
- Node.js 14+, tmux, Bash 4.0+ (macOS: `brew install bash`)
- [Claude Code CLI](https://claude.com/claude-code) or [Codex CLI](https://docs.openai.com/codex)

### One-line Install

```bash
curl -fsSL https://raw.githubusercontent.com/Minh-Tam-Solution/tinysdlc/main/scripts/remote-install.sh | bash
```

### From Source

```bash
git clone https://github.com/Minh-Tam-Solution/tinysdlc.git
cd tinysdlc
npm install && npm run build
./scripts/install.sh
```

### First Run

```bash
tinysdlc start
```

The setup wizard configures channels, AI provider, workspace, and default agent. After setup, optionally apply the full SDLC team:

```bash
tinysdlc sdlc init    # Creates 6 agents + 4 teams with SDLC roles
```

---

## How It Works

```text
 Discord ─┐
Telegram ─┤  JSON msg     ┌──────────────────────────────────┐
WhatsApp ─┤ ────────────→  │  ~/.tinysdlc/queue/              │
Heartbeat ┘                │  incoming/ → processing/ → outgoing/
                           └──────────┬───────────────────────┘
                                      │ Queue Processor (1s poll)
                           ┌──────────┴───────────────────────┐
                           │  Parallel dispatch per agent      │
                           │                                   │
                           │  @coder ──→ claude CLI            │
                           │  @reviewer → claude CLI           │
                           │  @pm ─────→ codex CLI             │
                           └──────────┬───────────────────────┘
                                      │ response JSON
 Discord ─┐                           │
Telegram ─┤  poll outgoing/ ←─────────┘
WhatsApp ─┘
```

Channel receives DM → pairing check → JSON to `incoming/` → atomic rename to `processing/` → route to target agent → spawn CLI in agent workspace → response to `outgoing/` → channel delivers.

Team collaboration: agent responses containing `[@teammate: message]` tags trigger internal queue entries with a 50-message loop guard.

---

## Commands

### Daemon

| Command | Description |
| ------- | ----------- |
| `tinysdlc start` | Build and launch tmux session |
| `tinysdlc stop` | Stop all processes |
| `tinysdlc restart` | Restart (safe from inside tmux) |
| `tinysdlc status` | Show running processes and activity |
| `tinysdlc setup` | Re-run setup wizard |
| `tinysdlc logs <type>` | Tail logs: `discord`, `telegram`, `whatsapp`, `queue`, `heartbeat`, `all` |

### Agents

| Command | Description |
| ------- | ----------- |
| `tinysdlc agent list` | List agents with provider, model, role |
| `tinysdlc agent add` | Add agent interactively |
| `tinysdlc agent show <id>` | Show agent config |
| `tinysdlc agent remove <id>` | Remove agent |
| `tinysdlc agent reset <id>` | Reset conversation history |
| `tinysdlc agent provider <id> <provider> --model <m>` | Set provider and model |

### Teams

| Command | Description |
| ------- | ----------- |
| `tinysdlc team list` | List teams |
| `tinysdlc team add` | Add team interactively |
| `tinysdlc team show <id>` | Show team config |
| `tinysdlc team remove <id>` | Remove team |
| `tinysdlc team visualize [id]` | Live TUI dashboard (React/Ink) |

### SDLC

| Command | Description |
| ------- | ----------- |
| `tinysdlc sdlc status` | Agents with SDLC roles and teams |
| `tinysdlc sdlc roles` | Reference table of all 6 roles |
| `tinysdlc sdlc init` | Apply defaults: 6 agents + 4 teams |
| `tinysdlc sdlc reinit [agent]` | Re-apply role templates |

### Other

| Command | Description |
| ------- | ----------- |
| `tinysdlc provider [name]` | Show or switch AI provider |
| `tinysdlc model [name]` | Show or switch model |
| `tinysdlc pairing list` | Show pending/approved senders |
| `tinysdlc pairing approve <code>` | Approve sender by pairing code |
| `tinysdlc channels reset <ch>` | Reset channel auth (e.g. WhatsApp QR) |
| `tinysdlc send "<message>"` | Send message to agent via CLI |
| `tinysdlc update` | Update to latest release |

### In-Chat Syntax

| Syntax | Description |
| ------ | ----------- |
| `@agent_id message` | Route to agent: `@coder fix the bug` |
| `@team_id message` | Route to team leader: `@dev fix auth` |
| `message` | No prefix sends to default agent |
| `/agent` | List agents |
| `/team` | List teams |
| `@agent_id /reset` | Reset agent conversation |

---

## SDLC Roles and Teams

### 6 Roles

| Role | Stages | Gate | Constraint |
| ---- | ------ | ---- | ---------- |
| `pm` | 00-01 Foundation/Plan | G0.1, G1 | No self-approve requirements |
| `architect` | 02-03 Design/Integrate | G2 | No tech decisions without ADR |
| `coder` | 04 Build | Sprint Gate | No merge without reviewer |
| `reviewer` | 04-05 Build/Verify | G3 | Never approve own code |
| `tester` | 05 Verify | G3 co-owner | No skip coverage thresholds |
| `devops` | 06-07 Deploy/Operate | G4 | No deploy without G3 |

### 4 Team Archetypes

| Team | Agents | Purpose |
| ---- | ------ | ------- |
| `planning` | pm, architect | Requirements to design |
| `dev` | coder, reviewer | Build to review |
| `qa` | tester, reviewer | Verify to approve |
| `fullstack` | all 6 roles | Full pipeline |

---

## Configuration

Settings live at `~/.tinysdlc/settings.json` (hot-reloaded, auto-repaired if corrupted):

```json
{
  "workspace": {
    "path": "~/tinysdlc-workspace"
  },
  "channels": {
    "enabled": ["discord", "telegram"],
    "discord": { "bot_token": "..." },
    "telegram": { "bot_token": "..." }
  },
  "agents": {
    "coder": {
      "name": "Developer",
      "provider": "anthropic",
      "model": "sonnet",
      "sdlc_role": "coder",
      "working_directory": "~/tinysdlc-workspace/coder"
    }
  },
  "teams": {
    "dev": {
      "name": "Development",
      "agents": ["coder", "reviewer"],
      "leader_agent": "coder"
    }
  },
  "monitoring": {
    "heartbeat_interval": 3600
  }
}
```

Each agent workspace at `~/tinysdlc-workspace/{agent_id}/` contains:

- `.claude/` — Claude Code config
- `AGENTS.md` — Role-specific instructions (from `templates/agents/{role}/`)
- `.tinysdlc/SOUL.md` — Agent identity
- `heartbeat.md` — Proactive check-in prompt

### Environment Variables

| Variable | Purpose |
| -------- | ------- |
| `TINYSDLC_HOME` | Override data dir (default: `~/.tinysdlc`) |
| `TINYSDLC_SKIP_UPDATE_CHECK` | Set `1` to disable update checks |

---

## Channel Setup

<details>
<summary>Discord</summary>

1. [Discord Developer Portal](https://discord.com/developers/applications) → Create application → Bot
2. Copy bot token, enable Message Content Intent
3. Invite via OAuth2 URL Generator (bot scope + Send Messages)
4. DM the bot directly

</details>

<details>
<summary>Telegram</summary>

1. Open Telegram, search `@BotFather`, send `/newbot`
2. Copy the bot token
3. Start a chat with your bot

</details>

<details>
<summary>WhatsApp</summary>

1. Run `tinysdlc start` — QR code appears in terminal
2. WhatsApp → Settings → Linked Devices → Link a Device → scan QR
3. Reset if needed: `tinysdlc channels reset whatsapp`

</details>

---

## Project Structure

```text
tinysdlc/
├── tinysdlc.sh                 # CLI entry point
├── src/                        # TypeScript
│   ├── queue-processor.ts      # Message processing loop
│   ├── channels/               # Discord, Telegram, WhatsApp clients
│   ├── lib/                    # config, invoke, routing, pairing, types
│   └── visualizer/             # React/Ink TUI dashboard
├── lib/                        # Bash
│   ├── daemon.sh               # Start/stop/restart
│   ├── agents.sh / teams.sh    # CRUD commands
│   ├── sdlc.sh                 # SDLC commands
│   ├── setup-wizard.sh         # Interactive setup
│   └── heartbeat-cron.sh       # Periodic check-ins
├── templates/                  # Role templates + default settings
├── docs/                       # SDLC-structured docs (stages 00-04)
└── scripts/                    # install, uninstall, bundle

~/.tinysdlc/                    # Runtime data
├── settings.json               # Configuration
├── queue/{incoming,processing,outgoing}/
├── logs/ channels/ files/ chats/ events/
└── pairing.json                # Sender allowlist

~/tinysdlc-workspace/           # Agent workspaces
├── coder/  reviewer/  pm/  ... # Each with .claude/, AGENTS.md, heartbeat.md
```

---

## Documentation

| Stage | Key Documents |
| ----- | ------------- |
| 00 Foundation | [Problem Statement](docs/00-foundation/problem-statement.md) |
| 01 Planning | [Requirements](docs/01-planning/requirements.md), [SDLC Agent Roles](docs/01-planning/sdlc-agent-roles.md) |
| 02 Design | [Agent Architecture](docs/02-design/agent-architecture.md), [Queue System](docs/02-design/queue-system-design.md), [Team Archetypes](docs/02-design/sdlc-team-archetypes.md) |
| 03 Integrate | [Channel Contracts](docs/03-integrate/channel-integration-contracts.md) |
| 04 Build | [Installation](docs/04-build/installation-guide.md), [Troubleshooting](docs/04-build/troubleshooting-guide.md), [SDLC Setup](docs/04-build/sdlc-agent-setup-guide.md) |

Full index: [docs/README.md](docs/README.md)

---

## Troubleshooting

```bash
tinysdlc status                              # check processes
tinysdlc logs all                            # tail all logs
tinysdlc stop && tinysdlc start              # restart
tinysdlc channels reset whatsapp             # re-auth WhatsApp
rm -rf ~/.tinysdlc/queue/processing/*        # unstick messages
```

| Problem | Fix |
| ------- | --- |
| Bash version error | `brew install bash` (need 4.0+) |
| WhatsApp not connecting | `tinysdlc channels reset whatsapp` |
| Messages stuck | `rm -rf ~/.tinysdlc/queue/processing/*` |
| Agent not found | `tinysdlc agent list` |
| Corrupted settings | Auto-repaired on start (`.bak` backup saved) |

See [Troubleshooting Guide](docs/04-build/troubleshooting-guide.md) for more.

---

## Credits

This project combines two open-source efforts:

- **[TinyClaw](https://github.com/jlia0/tinyclaw)** by jlia0 — Multi-agent orchestrator foundation
- **[SDLC Enterprise Framework v6.0.6](https://github.com/Minh-Tam-Solution/SDLC-Enterprise-Framework)** by Minh-Tam-Solution — AI+Human governance methodology

## License

MIT
