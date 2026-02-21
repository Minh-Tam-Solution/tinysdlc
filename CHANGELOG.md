# Changelog

All notable changes to TinySDLC will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-02-21

### Added
- Cross-team routing: agents can mention agents in other teams via `[@agent: message]`
- Zalo Bot Manager as recommended setup for Zalo Personal channel (simpler than zca-cli)
- ADR-013: ChannelPlugin bridge documentation with operational findings
- CHANGELOG.md for version tracking

### Changed
- Zalo Personal docs updated: Option A (Bot Manager, recommended) / Option B (zca-cli, advanced)
- Queue system design doc: added ChannelPlugin bridge section with diagram
- Channel integration contracts: fixed Zalo OA section (actual API format, correct auth field)

### Fixed
- Zalo OA plugin: handle single-object API response (was expecting array)
- Zalo OA plugin: use `event_name` field (not `event`) per actual API behavior

## [1.0.0] - 2026-02-20

First public release. Multi-agent, multi-team, multi-channel AI assistant orchestrator with MTS-SDLC-Lite governance.

### Added
- 8 SE4A agents with SDLC 6.1.0 role templates (researcher, pm, pjm, architect, coder, reviewer, tester, devops)
- 4 team archetypes: planning, dev, qa, fullstack
- 5 messaging channels: Discord, Telegram, WhatsApp, Zalo OA, Zalo Personal
- 3 AI providers: Anthropic Claude Code CLI, OpenAI Codex CLI, Ollama (local)
- File-based message queue with atomic operations (incoming/processing/outgoing)
- ChannelPlugin framework for Zalo OA and Zalo Personal integration
- ZeroClaw security patterns: credential scrubbing (11 regex), env scrubbing, shell guards (8 deny patterns), input sanitization (12 prompt injection patterns)
- Team collaboration via `[@teammate: message]` chain execution with 50-message loop guard
- In-chat commands: `/agent`, `/team`, `/reset`, `/workspace`
- Workspace switching for multi-project workflows
- React/Ink TUI dashboard for real-time team visualization
- Pairing-based sender access control (8-character codes)
- Heartbeat cron for periodic agent check-ins
- Auto-build on start (TypeScript recompile if source newer than output)
- Dual tsconfig: CommonJS (main) + ESM/NodeNext (React/Ink visualizer)
- Comprehensive docs: 5 SDLC stages (00-foundation through 04-build)

### Credits
- Based on [TinyClaw](https://github.com/jlia0/tinyclaw) by jlia0 (MIT)
- SDLC methodology from [MTS-SDLC-Lite](https://github.com/Minh-Tam-Solution/MTS-SDLC-Lite) v1.0.0 (MIT)
