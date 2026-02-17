# TinySDLC - Problem Statement & Vision

**SDLC Version**: 6.0.6
**Stage**: 00 - FOUNDATION
**Status**: Active
**Authority**: CTO Approved

---

## Problem Statement

AI assistants (Claude Code, Codex) are powerful individually, but there is no lightweight, open-source way to:

1. Run **multiple AI agents simultaneously** with isolated workspaces
2. Allow agents to **collaborate as teams** with real-time hand-offs
3. Connect agents to **multiple messaging channels** (Discord, WhatsApp, Telegram) for 24/7 availability
4. Maintain **persistent conversation state** across restarts

Existing solutions are either proprietary platforms (expensive, vendor-locked), single-agent wrappers, or require complex infrastructure.

## Vision

TinySDLC is a lightweight, tmux-based orchestrator that enables anyone with a Claude or Codex subscription to run multi-agent teams that communicate with users across messaging channels -- without breaking provider Terms of Service.

## Target Users

- Developers who want 24/7 AI assistants accessible via their existing chat apps
- Teams that need specialized AI agents collaborating on tasks
- Power users who want to self-host their AI assistant infrastructure

## Business Case

- **Open-source** (MIT) -- zero licensing cost
- **Uses existing subscriptions** -- no additional AI API costs
- **Self-hosted** -- full data control, no cloud dependency
- **Extensible** -- add new channels, providers, or agent behaviors
