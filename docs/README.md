# TinySDLC Documentation

**SDLC Framework**: 6.1.0 (LITE Tier)
**Project Version**: 0.0.5

---

## Documentation Structure

This project follows the SDLC Enterprise Framework v6.1.0 documentation standard.

| Stage | Folder | Purpose | Status |
|-------|--------|---------|--------|
| 00 | [00-foundation/](./00-foundation/) | WHY - Problem statement, vision | Active |
| 01 | [01-planning/](./01-planning/) | WHAT - Requirements, user stories | Active |
| 02 | [02-design/](./02-design/) | HOW - Architecture, design decisions | Active |
| 03 | [03-integrate/](./03-integrate/) | INTEGRATE - Channel API contracts | Active |
| 04 | [04-build/](./04-build/) | BUILD - Installation, troubleshooting | Active |
| 10 | [10-archive/](./10-archive/) | Archive - Legacy/historical docs | Empty |

## Quick Links

**Planning** (Stage 01):
- [Requirements](./01-planning/requirements.md) - Core + SDLC Framework requirements
- [SDLC Agent Roles](./01-planning/sdlc-agent-roles.md) - 6 role definitions, SE4A/SE4H mapping
- [Sprint Plan — SDLC Support](./01-planning/sprint-plan-sdlc-support.md) - S01 sprint plan
- [Sprint Plan — Ecosystem Upgrade](./01-planning/sprint-plan-ecosystem-upgrade.md) - S02 sprint plan (CTO-2026-002)

**Architecture** (Stage 02):
- [Agent Architecture](./02-design/agent-architecture.md) - Multi-agent system design
- [Message Pattern Architecture](./02-design/message-pattern-architecture.md) - Message flow patterns
- [Queue System Design](./02-design/queue-system-design.md) - File-based queue architecture
- [Team Communication Design](./02-design/team-communication-design.md) - Team collaboration design
- [SDLC Team Archetypes](./02-design/sdlc-team-archetypes.md) - 4 team templates, flows, gate mapping
- [ADR: SDLC Framework Support](./02-design/adr-sdlc-framework-support.md) - Architecture decisions for v6.1.0 support

**Integration** (Stage 03):
- [Channel Integration Contracts](./03-integrate/channel-integration-contracts.md) - Discord/Telegram/WhatsApp APIs
- [SDLC-Orchestrator Integration Proposal](./03-integrate/sdlc-orchestrator-proposal.md) - Proposed integration with governance control plane
- [CTO Directive — Ecosystem Upgrade V4](./03-integrate/CTO-DIRECTIVE-ECOSYSTEM-UPGRADE-V4.md) - 3-product ecosystem strategy (CTO-2026-002)

**Development** (Stage 04):
- [Installation Guide](./04-build/installation-guide.md) - Setup and installation
- [Troubleshooting Guide](./04-build/troubleshooting-guide.md) - Common issues and fixes
- [SDLC Agent Setup Guide](./04-build/sdlc-agent-setup-guide.md) - Configure SDLC roles, Ollama, system prompts
- [CTO Report — TinySDLC Status](./04-build/cto-report-tinysdlc-status.md) - Status report for SDLC Orchestrator alignment

---

**SDLC Tier**: LITE (1-2 developers)
**Stages 05-09**: Not applicable for current tier. Will be added if project upgrades.
