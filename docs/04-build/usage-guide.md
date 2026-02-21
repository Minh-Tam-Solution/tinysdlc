# TinySDLC - Usage Guide

**SDLC Version**: 6.1.0
**Stage**: 04 - BUILD
**Status**: Active
**Authority**: CTO Approved

---

This guide covers day-to-day usage of TinySDLC after installation. If you haven't installed yet, start with the [Installation Guide](./installation-guide.md).

**Prerequisites**: TinySDLC installed, `npm run build` completed, at least one channel configured.

---

## Table of Contents

- [Your First 15 Minutes](#your-first-15-minutes)
- [Message Routing](#message-routing)
- [In-Chat Commands](#in-chat-commands)
- [CLI Command Reference](#cli-command-reference)
- [Channel Setup Quick Reference](#channel-setup-quick-reference)
- [AI Provider Comparison](#ai-provider-comparison)
- [Configuration Reference](#configuration-reference)
- [Pairing and Access Control](#pairing-and-access-control)
- [Tips and Patterns](#tips-and-patterns)
- [Further Reading](#further-reading)

---

## Your First 15 Minutes

### Step 1: Start and Verify

```bash
./tinysdlc.sh start
```

On first run, the interactive setup wizard walks you through channel tokens, AI provider selection, and workspace configuration. After setup:

```bash
./tinysdlc.sh status
```

You should see a tmux session with panes for each enabled channel, the queue processor, and log tailing. To view the live panes:

```bash
tmux attach -t tinysdlc
```

Press `Ctrl+B` then `D` to detach without stopping TinySDLC.

### Step 2: Send Your First Message

Open your configured messaging app (Telegram, Discord, or WhatsApp) and send a direct message to the bot.

**First-time pairing flow**:
1. You send any message to the bot
2. The bot replies with an 8-character pairing code (e.g., `ABCD1234`)
3. In your terminal, approve the code:

```bash
./tinysdlc.sh pairing approve ABCD1234
```

4. Send your message again — it will now be processed

### Step 3: Route to a Specific Agent

Prefix your message with `@agent_id` to route to a specific agent:

```
@coder fix the login validation bug in src/auth.ts
```

```
@architect what caching pattern should we use for the user API?
```

If you don't use an `@` prefix, the message goes to the `default` agent.

### Step 4: Route to a Team

Prefix with `@team_id` to start a team collaboration chain:

```
@dev implement the search feature for products
```

The team leader receives the message first, then delegates to teammates via `[@teammate: message]` tags. You receive a consolidated response once the chain completes.

---

## Message Routing

### Routing to Individual Agents

```
@agent_id your message here
```

TinySDLC resolves the target in this order:
1. **Agent ID** (exact match): `@coder`, `@reviewer`, `@pm`
2. **Team ID** (exact match): `@dev`, `@planning`, `@qa` — routes to team leader
3. **Agent name** (case-insensitive): `@Developer`, `@"Code Reviewer"`
4. **Team name** (case-insensitive): `@"Development Team"`
5. **No prefix**: routes to the `default` agent

### Routing to Teams

When you send `@team_id message`, the message goes to the team's **leader agent**. The leader can then delegate to teammates using tags in its response:

```
[@reviewer: please review the implementation above for security issues]
```

**Parallel fan-out**: An agent can mention multiple teammates at once:

```
[@coder,reviewer: here's the design spec, please implement and review]
```

Or use separate tags for different instructions:

```
[@coder: implement the API endpoint]
[@tester: prepare test cases for the endpoint]
```

### Cross-Team Routing (v1.1.0)

Agents can mention any agent or team, even across team boundaries. The mention resolution order is:

1. **Same-team agent** (fastest path): `[@reviewer: msg]` when reviewer is in your team
2. **Cross-team agent**: `[@pm: msg]` when PM is in a different team (e.g., `planning`)
3. **Team leader**: `[@planning: msg]` routes to the planning team's leader agent

**Example**: Coder (team `dev`) asks PM (team `planning`) to update requirements:

```
You → @dev "implement login and update requirements"
  → coder (dev team leader) implements login
  → coder responds with [@pm: please update requirements for login]
    → pm (planning team) receives the message       ← CROSS-TEAM
    → pm updates requirements, responds
  → consolidated response sent back to you
```

**Safety guards**:
- **Circular detection**: If PM responds with `[@coder: ...]`, the mention is blocked because coder already participated in this conversation
- **Depth limit**: Delegation chains are limited to `max_delegation_depth` (default 5) across all teams
- **Conversation cap**: 50 messages total per conversation (same as v1.0.0)

### Team Chain Execution

When an agent mentions another agent (same-team or cross-team):
1. The shared context (text outside `[@...]` tags) is preserved
2. The directed message is appended after a separator
3. The target agent receives both shared context and directed message
4. The target agent can further mention other agents (if not already in the chain)
5. Once all branches complete, responses are aggregated and sent back

**Loop guard**: Conversations are capped at 50 messages to prevent infinite loops. Circular mentions (agent A → B → A) are automatically blocked.

**Example flow** with `@dev implement user search`:

```
You → @dev "implement user search"
  → coder (leader) receives message
  → coder implements, responds with [@reviewer: please review]
    → reviewer receives code + review request
    → reviewer responds with approval
  → consolidated response sent back to you
```

---

## In-Chat Commands

These commands work in any channel. Use `/` or `!` prefix.

### `/agent`

Lists all configured agents with provider, model, and SDLC role.

```
/agent
```

Output:
```
Available Agents:

@coder - Developer
  Provider: anthropic/sonnet
  Role: coder

@reviewer - Code Reviewer
  Provider: anthropic/opus
  Role: reviewer

Usage: Start your message with @agent_id to route to a specific agent.
```

### `/team`

Lists all teams with members and leader.

```
/team
```

### `/reset`

Reset an agent's conversation history. The next message starts a fresh conversation.

```
/reset @coder
/reset @coder @reviewer @tester
```

### `/workspace`

Manage project workspaces. See [Workspace Commands](#workspace-commands) under CLI Reference for full details.

```
/workspace                              Show current project
/workspace list                         List all registered projects
/workspace add myapp ~/repos/my-app     Register a project
/workspace set myapp                    Switch to project (resets all agents)
/workspace remove myapp                 Unregister project
```

---

## CLI Command Reference

### Daemon Commands

| Command | Description |
|---------|-------------|
| `tinysdlc start` | Start daemon (runs setup wizard on first launch) |
| `tinysdlc stop` | Stop all processes and tmux session |
| `tinysdlc restart` | Stop and restart |
| `tinysdlc status` | Show running status |
| `tinysdlc attach` | Attach to tmux session |
| `tinysdlc setup` | Run setup wizard again |
| `tinysdlc update` | Update to latest version |

### Agent Commands

| Command | Description |
|---------|-------------|
| `tinysdlc agent list` | List all agents (alias: `agent ls`) |
| `tinysdlc agent add` | Add agent interactively |
| `tinysdlc agent show <id>` | Show agent config (JSON) |
| `tinysdlc agent remove <id>` | Remove agent (alias: `agent rm`) |
| `tinysdlc agent reset <id> [id2 ...]` | Reset conversation for one or more agents |
| `tinysdlc agent provider <id>` | Show agent's provider/model |
| `tinysdlc agent provider <id> anthropic` | Set provider |
| `tinysdlc agent provider <id> anthropic --model opus` | Set provider and model |

Shorthand: `tinysdlc reset <id>` is the same as `tinysdlc agent reset <id>`.

### Team Commands

| Command | Description |
|---------|-------------|
| `tinysdlc team list` | List all teams (alias: `team ls`) |
| `tinysdlc team add` | Create team interactively |
| `tinysdlc team show <id>` | Show team config (JSON) |
| `tinysdlc team remove <id>` | Remove team (alias: `team rm`) |
| `tinysdlc team visualize [id]` | Launch TUI dashboard (alias: `team viz`) |

### Provider and Model Commands

| Command | Description |
|---------|-------------|
| `tinysdlc provider` | Show current global provider/model |
| `tinysdlc provider anthropic` | Switch global provider |
| `tinysdlc provider anthropic --model opus` | Switch provider and model |
| `tinysdlc model` | Show current model |
| `tinysdlc model sonnet` | Switch model |

These set the **global default**. Per-agent overrides (via `agent provider`) take precedence.

### SDLC Commands

| Command | Description |
|---------|-------------|
| `tinysdlc sdlc status` | Show SDLC config (agents, teams, roles) |
| `tinysdlc sdlc roles` | Display all 12 SDLC roles |
| `tinysdlc sdlc init` | Apply defaults: 8 agents + 4 teams |
| `tinysdlc sdlc reinit [id]` | Re-apply role templates to agent(s) |

See [SDLC Agent Setup Guide](./sdlc-agent-setup-guide.md) for detailed role configuration.

### Pairing Commands

| Command | Description |
|---------|-------------|
| `tinysdlc pairing pending` | Show pending pairing requests |
| `tinysdlc pairing approved` | Show approved senders |
| `tinysdlc pairing list` | Show all (pending + approved) |
| `tinysdlc pairing approve <code>` | Approve a sender by 8-char code |
| `tinysdlc pairing unpair <channel> <sender_id>` | Revoke access |

### Workspace Commands

| Command | Description |
|---------|-------------|
| `tinysdlc send "<message>"` | Send message via CLI (for testing) |
| `tinysdlc channels reset <channel>` | Reset channel auth (e.g., WhatsApp QR) |
| `tinysdlc logs [type]` | View logs: `all`, `queue`, `discord`, `telegram`, `whatsapp`, `zalo`, `zalouser`, `heartbeat`, `daemon` |

---

## Channel Setup Quick Reference

### Discord

1. Create application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Go to **Bot** tab, enable **Message Content Intent**
3. Copy the bot token
4. Enter token during `tinysdlc setup` or add to `settings.json`:
   ```json
   "channels": { "enabled": ["discord"], "discord": { "bot_token": "YOUR_TOKEN" } }
   ```
5. Invite bot to your server via OAuth2 URL, then DM it directly

- Max message length: 2000 characters (auto-split)
- File attachments: supported (50MB limit)

### Telegram

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot`, follow prompts, copy the token
3. **Send `/start` to your new bot** (required before it can receive messages)
4. Enter token during `tinysdlc setup` or add to `settings.json`:
   ```json
   "channels": { "enabled": ["telegram"], "telegram": { "bot_token": "YOUR_TOKEN" } }
   ```

- Max message length: 4096 characters (auto-split)
- File attachments: supported (50MB limit)
- Registered commands: `/agent`, `/team`, `/reset`

### WhatsApp

1. Enable WhatsApp in `tinysdlc setup` (no token needed)
2. On first start, a QR code appears in the terminal
3. Scan with WhatsApp on your phone (Link a Device)
4. Session persists across restarts

- To re-pair: `tinysdlc channels reset whatsapp`
- Max message length: 65536 characters
- File attachments: supported (50MB limit)

### Zalo OA (Official Account)

1. Register at [Zalo Bot Platform](https://bot-api.zapps.me)
2. Get your `app_id` and `secret_key`
3. Format token as `app_id:secret_key`
4. Add to `settings.json`:
   ```json
   "channels": { "enabled": ["zalo"], "zalo": { "token": "APP_ID:SECRET_KEY" } }
   ```

- HTTP long-polling (no public endpoint needed)
- Text only (Phase 1 — no file attachments)
- Max message length: 2000 characters
- See [Zalo Channel Setup](../03-integrate/zalo-channel-setup.md) for details

### Zalo Personal

**Option A: Zalo Bot Manager (Recommended)**

1. Go to [Zalo Bot Manager](https://bot.zaloplatforms.com) and sign in with your Zalo account
2. Create a new bot and configure its settings
3. Copy the bot token (format: `12345689:abc-xyz`)
4. Add to `settings.json`:
   ```json
   "channels": { "enabled": ["zalouser"], "zalouser": { "token": "YOUR_BOT_TOKEN" } }
   ```
5. Or set via environment variable: `ZALO_BOT_TOKEN=12345689:abc-xyz`

No binary to install, no QR code — just a web dashboard and a token. Free tier: up to 3 bots, 50 users per bot, 3,000 messages/month.

**Option B: zca-cli (Advanced)**

For users who need direct access to the Zalo Personal API without going through the Bot Platform:

1. Install [zca-cli](https://github.com/nicepkg/zca-cli) separately
2. Run `zca auth login` (QR code auth, external to TinySDLC)
3. Enable in `settings.json`:
   ```json
   "channels": { "enabled": ["zalouser"] }
   ```

zca-cli gives full control but requires installing a binary and managing auth sessions manually.

- Long-polling by default (no public endpoint needed)
- Auto-restart with exponential backoff on crash
- Text only, 2000 character limit
- See [Zalo Channel Setup](../03-integrate/zalo-channel-setup.md) for details

---

## AI Provider Comparison

### Anthropic (Claude Code CLI)

| Aspect | Details |
|--------|---------|
| Models | `sonnet` (fast, recommended), `opus` (deep reasoning) |
| Conversation | Persistent — `-c` flag continues previous context |
| Auth | `ANTHROPIC_API_KEY` env var or `claude` CLI login |
| Best for | coder, tester, devops (sonnet); researcher, architect, reviewer (opus) |

### OpenAI (Codex CLI)

| Aspect | Details |
|--------|---------|
| Models | `gpt-5.1`, `gpt-5.2`, `gpt-5.3-codex` |
| Conversation | Independent — each call starts fresh |
| Auth | `OPENAI_API_KEY` env var |
| Best for | Code generation tasks, alternative to Claude |

### Ollama (Local / Self-Hosted)

| Aspect | Details |
|--------|---------|
| Models | `qwen3`, `qwen3-coder` (30B), `llama3.2`, `codellama`, `deepseek-coder-v2` |
| Conversation | Stateless — no memory between calls |
| Auth | None (local server) |
| URL | Default `http://localhost:11434`, configurable via `providers.ollama.url` |
| Best for | Privacy-sensitive tasks, cost savings, simple queries |

### Mixing Providers

Each agent can use a different provider. Set per-agent overrides:

```bash
# Use opus for architect (deep reasoning)
tinysdlc agent provider architect anthropic --model opus

# Use sonnet for coder (fast iteration)
tinysdlc agent provider coder anthropic --model sonnet

# Use Ollama for researcher (local, free)
tinysdlc agent provider researcher ollama --model qwen3
```

Or edit `settings.json` directly — each agent has its own `provider` and `model` fields.

---

## Configuration Reference

### settings.json Location

Default: `~/.tinysdlc/settings.json`

Override with `TINYSDLC_HOME` environment variable:
```bash
export TINYSDLC_HOME=/path/to/custom/dir
```

Settings are **hot-reloaded** on every message — no restart needed for most changes. Exception: channel tokens require a restart.

### Full Structure

```jsonc
{
  // Workspace
  "workspace": {
    "path": "~/tinysdlc-workspace",   // Base directory for agent workspaces
    "name": "my-project"               // Project name
  },

  // Channels
  "channels": {
    "enabled": ["telegram", "discord"],  // Active channels
    "discord": { "bot_token": "..." },
    "telegram": { "bot_token": "..." },
    "whatsapp": {},                      // No config (QR auth)
    "zalo": {
      "token": "app_id:secret_key",
      "apiBaseUrl": "https://bot-api.zapps.me/bot"  // Optional override
    },
    "zalouser": {
      "zcaPath": "zca",                 // Path to zca-cli binary
      "profile": ""                      // Multi-account profile
    }
  },

  // Global AI defaults
  "models": {
    "provider": "anthropic",             // "anthropic", "openai", or "ollama"
    "anthropic": { "model": "sonnet" },
    "openai": { "model": "gpt-5.3-codex" }
  },

  // Agents
  "agents": {
    "coder": {
      "name": "Developer",
      "provider": "anthropic",           // Per-agent provider override
      "model": "sonnet",                 // Per-agent model override
      "working_directory": "~/workspace/coder",
      "sdlc_role": "coder",             // SDLC role (optional)
      "system_prompt": "...",            // Inline system prompt (optional)
      "prompt_file": "custom-prompt.md", // File-based prompt (optional)
      "project_directory": "~/my-project", // Shared project dir (optional)
      "shell_guard_enabled": true,       // Shell safety guards (default: true)
      "max_delegation_depth": 1,         // Max delegation depth (default: 1)
      "fallback_providers": ["ollama"]   // Fallback chain (optional)
    }
  },

  // Teams
  "teams": {
    "dev": {
      "name": "Development Team",
      "agents": ["coder", "reviewer"],
      "leader_agent": "coder",
      "description": "Implementation and review"
    }
  },

  // Providers
  "providers": {
    "ollama": { "url": "http://localhost:11434" }
  },

  // Monitoring
  "monitoring": {
    "heartbeat_interval": 3600          // Seconds between heartbeat check-ins
  },

  // Projects (workspace switching)
  "projects": {
    "myapp": { "name": "My App", "path": "/home/user/repos/my-app" }
  },
  "active_project": "myapp",

  // Security toggles
  "input_sanitization_enabled": true,    // Prompt injection protection
  "credential_scrubbing_enabled": true,  // Strip credentials from messages
  "processing_status_enabled": true      // Show progress in channels
}
```

### Agent Workspace Layout

Each agent gets an isolated workspace directory:

```
~/tinysdlc-workspace/coder/
├── .claude/              # Claude Code CLI context
├── .tinysdlc/
│   └── SOUL.md           # Agent personality
├── AGENTS.md             # Role-specific system prompt (from template)
├── SYSTEM_CONTEXT.md     # Injected per-message (auto-generated)
└── [project files]
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `TINYSDLC_HOME` | Override data directory | `~/.tinysdlc` |
| `ANTHROPIC_API_KEY` | Claude API key | Set via `claude` CLI login |
| `OPENAI_API_KEY` | OpenAI API key | Required for Codex provider |
| `OLLAMA_URL` | Ollama server URL | `http://localhost:11434` |

---

## Pairing and Access Control

### How Pairing Works

TinySDLC uses an allowlist system to control who can interact with your agents:

1. An unknown sender messages the bot
2. TinySDLC generates an 8-character pairing code
3. The code is shown to the sender in the channel
4. You (the admin) approve the code via CLI
5. The sender is permanently allowed until unpaired

### Managing Access

```bash
# See who is requesting access
tinysdlc pairing pending

# Approve a sender
tinysdlc pairing approve ABCD1234

# See all approved senders
tinysdlc pairing approved

# Revoke access
tinysdlc pairing unpair telegram 123456789
```

There is no auto-approve mode — this is an intentional security decision. Every sender must be explicitly approved.

---

## Tips and Patterns

### Be Specific with Agents

Provide file paths, error messages, and expected behavior:

```
@coder add input validation to src/auth/login.ts — email must be valid,
password minimum 8 characters. Return 400 with specific error messages.
```

### Choose the Right Target

| Target | When to Use |
|--------|------------|
| `@coder` | Implement a specific feature or fix |
| `@reviewer` | Review code for quality and security |
| `@architect` | Design decisions, architecture patterns |
| `@planning` | Full requirements → design → architecture flow |
| `@dev` | Implementation → review cycle |
| `@qa` | Testing and quality validation |
| `@fullstack` | End-to-end handling for small tasks |

### Project Switching

When working on multiple codebases, use workspace commands:

```
/workspace add frontend ~/repos/frontend
/workspace add backend ~/repos/backend
/workspace set frontend
```

Switching projects auto-resets all agent conversations so agents start fresh in the new codebase context.

### Custom System Prompts

Two options for customizing agent behavior:

1. **Inline** (in `settings.json`):
   ```json
   "system_prompt": "You are a senior Go developer. Follow Go idioms."
   ```

2. **File-based** (for longer prompts):
   ```json
   "prompt_file": "~/prompts/go-expert.md"
   ```

See the [SDLC Agent Setup Guide](./sdlc-agent-setup-guide.md) for detailed configuration.

### Long Responses

Responses over 4000 characters are automatically saved as `.md` file attachments in channels that support file uploads (Discord, Telegram, WhatsApp).

---

## Further Reading

- [Installation Guide](./installation-guide.md) — Setup and installation options
- [Troubleshooting Guide](./troubleshooting-guide.md) — Common issues and fixes
- [SDLC Agent Setup Guide](./sdlc-agent-setup-guide.md) — Configure roles, Ollama, system prompts
- [Channel Integration Contracts](../03-integrate/channel-integration-contracts.md) — Discord/Telegram/WhatsApp API details
- [Zalo Channel Setup](../03-integrate/zalo-channel-setup.md) — Zalo OA and Personal setup
- [SDLC Team Archetypes](../02-design/sdlc-team-archetypes.md) — Team templates and gate mapping
- [Agent Architecture](../02-design/agent-architecture.md) — Multi-agent system design
- [MTS-SDLC-Lite](https://github.com/Minh-Tam-Solution/MTS-SDLC-Lite) — SDLC 6.1.0 methodology
