# TinySDLC - SDLC Agent Setup Guide

**SDLC Version**: 6.1.0
**Stage**: 04 - BUILD
**Status**: Active
**Authority**: CTO Approved

---

## Overview

This guide explains how to set up TinySDLC with SDLC Framework v6.1.0 agents and teams. After following this guide, you will have a fully configured multi-agent environment that any SDLC practitioner can use immediately.

---

## Prerequisites

- TinySDLC installed and configured (`tinysdlc setup` completed)
- At least one messaging channel active (Telegram recommended)
- Anthropic API key configured (for Claude agents)
- Optional: Ollama installed or accessible at a URL (for local model support)

---

## Option A: Quick Setup with `tinysdlc sdlc init` (Recommended)

The fastest way to get SDLC-ready:

```bash
# Apply all 6 SDLC agents + 4 teams
tinysdlc sdlc init

# Verify the configuration
tinysdlc sdlc status

# Check role mapping
tinysdlc sdlc roles

# Restart to apply changes
./tinysdlc.sh restart
```

This creates:
- **6 agents**: `pm`, `architect`, `coder`, `reviewer`, `tester`, `devops`
- **4 teams**: `planning`, `dev`, `qa`, `fullstack`
- **Workspace directories** for each agent

---

## Option B: Manual Setup

### Step 1: Add SDLC Agents

Edit `~/.tinysdlc/settings.json` and add to the `agents` section:

```json
"pm": {
  "name": "Product Manager",
  "provider": "anthropic",
  "model": "sonnet",
  "sdlc_role": "pm",
  "working_directory": "~/tinysdlc-workspace/pm"
},
"architect": {
  "name": "Solution Architect",
  "provider": "anthropic",
  "model": "opus",
  "sdlc_role": "architect",
  "working_directory": "~/tinysdlc-workspace/architect"
},
"coder": {
  "name": "Developer",
  "provider": "anthropic",
  "model": "sonnet",
  "sdlc_role": "coder",
  "working_directory": "~/tinysdlc-workspace/coder"
},
"reviewer": {
  "name": "Code Reviewer",
  "provider": "anthropic",
  "model": "opus",
  "sdlc_role": "reviewer",
  "working_directory": "~/tinysdlc-workspace/reviewer"
},
"tester": {
  "name": "QA Tester",
  "provider": "anthropic",
  "model": "sonnet",
  "sdlc_role": "tester",
  "working_directory": "~/tinysdlc-workspace/tester"
},
"devops": {
  "name": "DevOps Engineer",
  "provider": "anthropic",
  "model": "sonnet",
  "sdlc_role": "devops",
  "working_directory": "~/tinysdlc-workspace/devops"
}
```

### Step 2: Add SDLC Teams

Add to the `teams` section:

```json
"planning": {
  "name": "Planning Team",
  "agents": ["pm", "architect"],
  "leader_agent": "pm",
  "description": "Foundation & Planning — Stage 00-01"
},
"dev": {
  "name": "Development Team",
  "agents": ["coder", "reviewer"],
  "leader_agent": "coder",
  "description": "Build & Review — Stage 04-05"
},
"qa": {
  "name": "QA Team",
  "agents": ["tester", "reviewer"],
  "leader_agent": "tester",
  "description": "Quality Assurance — Stage 05 — required for G3"
},
"fullstack": {
  "name": "Full Stack Team",
  "agents": ["pm", "architect", "coder", "reviewer"],
  "leader_agent": "pm",
  "description": "End-to-End — LITE tier"
}
```

### Step 3: Restart

```bash
./tinysdlc.sh restart
```

---

## Option C: Ollama Agents (Company Infrastructure)

To use company Ollama infrastructure at `https://api.nhatquangholding.com`:

### Configure Ollama URL in settings.json

```json
"providers": {
  "ollama": {
    "url": "https://api.nhatquangholding.com"
  }
}
```

### Add an Ollama agent

```json
"assistant": {
  "name": "Local Assistant",
  "provider": "ollama",
  "model": "qwen3",
  "working_directory": "~/tinysdlc-workspace/assistant"
}
```

**Supported Ollama models:**

| Alias | Full Model ID |
|-------|---------------|
| `llama3.2` | `llama3.2` |
| `llama3.1` | `llama3.1` |
| `qwen3` | `qwen3` |
| `qwen3-coder` | `qwen3-coder:30b` |
| `codellama` | `codellama` |
| `deepseek-coder-v2` | `deepseek-coder-v2` |

**Note:** Ollama agents are stateless — no conversation memory across calls. Suitable for SE4A single-task agents.

---

## Testing Your Setup

### 1. Verify configuration

```bash
tinysdlc sdlc status
```

Expected output: table showing 6 agents with their SDLC roles and 4 teams.

### 2. Test the planning team

From Telegram, send:
```
@planning I want to add a feature to export conversations to PDF
```

Expected: PM analyzes and asks architect for feasibility.

### 3. Test the dev team

```
@dev add a /version command that returns the current TinySDLC version
```

Expected: Coder implements, then mentions reviewer for code review.

### 4. Test a standalone agent

```
@architect what's the best approach for adding conversation persistence?
```

Expected: Architect analyzes the design question with SDLC stage awareness.

---

## Custom System Prompts

You can add a custom system prompt to any agent:

### Inline prompt

```json
"pm": {
  "name": "Product Manager",
  "provider": "anthropic",
  "model": "sonnet",
  "sdlc_role": "pm",
  "system_prompt": "You are the PM for a fintech startup. Always consider regulatory compliance in your requirements.",
  "working_directory": "~/tinysdlc-workspace/pm"
}
```

### File-based prompt

```json
"pm": {
  "prompt_file": "~/tinysdlc-workspace/pm-context.md",
  ...
}
```

The system prompt is written to `SYSTEM_CONTEXT.md` in the agent's working directory and picked up by Claude via context.

---

## Shared Project Directory

For agents that need to access the same codebase (e.g., `coder` and `reviewer`):

```json
"coder": {
  "project_directory": "~/projects/my-app",
  ...
},
"reviewer": {
  "project_directory": "~/projects/my-app",
  ...
}
```

The project directory path is prepended to each message so the agent knows where to find the code.

---

## Troubleshooting

### Agent not using role-specific template

The role template is applied only when the agent directory is created for the first time. If the agent already has a workspace directory, delete it and let TinySDLC recreate it:

```bash
rm -rf ~/tinysdlc-workspace/<agent_id>
./tinysdlc.sh restart
# Send a message to the agent to trigger workspace creation
```

### Ollama agent not responding

Check the Ollama URL:
```bash
curl https://api.nhatquangholding.com/api/tags
# Should return list of available models
```

Check settings:
```bash
tinysdlc sdlc status
# Verify Ollama URL is shown correctly
```

### Agent not following SDLC constraints

The SDLC role template is written to the agent's `.claude/CLAUDE.md` on first setup. If the agent was created before SDLC support was added, recreate the workspace as above.
