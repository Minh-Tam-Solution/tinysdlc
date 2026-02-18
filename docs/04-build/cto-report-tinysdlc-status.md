# TinySDLC — CTO Status Report for SDLC Orchestrator Alignment

**SDLC Version**: 6.0.6
**Stage**: 04 - BUILD
**Status**: Active
**Authority**: CTO Approved
**Report Date**: 2026-02-18
**From**: TinySDLC Development Team
**To**: CTO, SDLC Orchestrator Team

---

## Executive Summary

TinySDLC has completed its SDLC Framework v6.0.6 integration sprint. The platform now ships with **8 built-in SDLC agents** and **4 team archetypes** that operationalize all 10 framework stages. ADR-056 (Multi-Agent Team Engine) alignment is complete across all protocol and security modules. This report provides the SDLC Orchestrator team with a comprehensive update for ecosystem alignment.

---

## 1. Current State

### 1.1 Platform Overview

TinySDLC is a **multi-agent, multi-team, multi-channel 24/7 AI assistant orchestrator** that operationalizes the SDLC Enterprise Framework v6.0.6. It runs AI agents (Claude Code CLI, OpenAI Codex CLI, Ollama) organized into teams with SDLC roles. Messages arrive from Discord, WhatsApp, Telegram, Zalo OA, and Zalo Personal through a file-based queue system with atomic operations.

### 1.2 Agent Roster (8 Agents)

| Agent | Role | SDLC Stages | Gate Ownership | Key Constraint |
|-------|------|-------------|----------------|----------------|
| `researcher` | Researcher | 00-01 Foundation/Plan | G0.1 | Research, never decide |
| `pm` | Product Manager | 00-01 Foundation/Plan | G0.1, G1 | No self-approve requirements |
| `pjm` | Project Manager | 01-04 Plan/Build | G-Sprint | Coordinate, never override |
| `architect` | Solution Architect | 02-03 Design/Integrate | G2 | No tech decisions without ADR |
| `coder` | Developer | 04 Build | Sprint Gate | No merge without reviewer |
| `reviewer` | Code Reviewer | 04-05 Build/Verify | G3 Ship Ready | Never approve own code |
| `tester` | QA Tester | 05 Verify | G3 (co-owner) | No skip coverage thresholds |
| `devops` | DevOps Engineer | 06-07 Deploy/Operate | G4 | No deploy without G3 confirmed |

### 1.3 Team Archetypes (4 Teams)

| Team | Agents | Leader | Purpose |
|------|--------|--------|---------|
| `planning` | researcher, pm, pjm, architect | pm | Foundation & Planning (Stage 00-01, Gates G0.1, G1) |
| `dev` | coder, reviewer | coder | Build & Review (Stage 04-05, Sprint Gate) |
| `qa` | tester, reviewer | tester | Quality Assurance (Stage 05, Gate G3) |
| `fullstack` | researcher, pm, pjm, architect, coder, reviewer | pm | End-to-End (all stages, LITE tier) |

### 1.4 AI Provider Support

| Provider | CLI/API | Models | Notes |
|----------|---------|--------|-------|
| Anthropic | Claude Code CLI | sonnet, opus | Primary provider |
| OpenAI | Codex CLI | gpt-5.1, gpt-5.2, gpt-5.3-codex | Alternative provider |
| Ollama | HTTP REST API | llama3.2, qwen3, codellama, deepseek-coder-v2 | Local/self-hosted, configurable URL |

### 1.5 Channel Support

| Channel | Integration | Status |
|---------|------------|--------|
| Telegram | node-telegram-bot-api (ChannelPlugin) | Production |
| Discord | discord.js 14 (ChannelPlugin) | Production |
| WhatsApp | whatsapp-web.js (ChannelPlugin) | Production |
| Zalo OA | Bot Platform API, HTTP long-polling (ChannelPlugin) | Production |
| Zalo Personal | zca-cli child process wrapper (ChannelPlugin) | Production |
| Heartbeat | Internal cron-based check-in | Production |

---

## 2. Sprint Deliverables

### 2.1 Commits (This Sprint)

| Commit | Description |
|--------|-------------|
| `93729e9` | docs: add CTO Directive for SDLC Ecosystem Strategic Upgrade v4 |
| `982540b` | feat: align protocol-adapter, failover, sanitizer, shell-guard with ADR-056 |
| `349f2de` | feat: auto-apply SDLC Framework v6.0.6 defaults in setup wizard |
| `653bf1e` | feat: add Researcher agent for Stage 00-01 (WHY/WHAT research) |
| `2da4f2b` | fix: correct researcher agent count and team membership strings |
| `2550454` | feat: add Project Manager (PJM) agent |
| `f6d3a19` | feat: add Project Manager (pjm) agent for Stage 01-04 execution |

### 2.2 Key Changes Summary

**ADR-056 Integration (4 modules)**:
- `protocol-adapter.ts` — Unblocked; canonical schema aligned with `agent_messages` table (processing_status, processing_lane, failover_reason, evidence_id)
- `failover.ts` — 6-category error classification with abort matrix (auth/billing→ABORT, rate_limit/timeout→FALLBACK, format→RETRY 1x)
- `input-sanitizer.ts` — 12 prompt injection patterns aligned to ADR-056 Non-Negotiable #4
- `shell-guard.ts` — 8 mandatory deny patterns aligned to ADR-056 Section 10.2 + output truncation

**SDLC Agent Framework**:
- Built-in 8 agents from first setup (no separate `sdlc init` required)
- Role-specific AGENTS.md templates for all 8 roles
- PM vs PJM separation (WHAT vs HOW)
- Researcher agent for Stage 00-01 WHY research

**Setup Wizard Enhancement**:
- Auto-applies SDLC Framework v6.0.6 defaults during initial setup
- Creates workspace directories with role-specific templates
- Preserves user channels/tokens during merge

---

## 3. ADR-056 Alignment Details

### 3.1 Canonical Protocol (protocol-adapter.ts)

```
TinySDLC CanonicalAgentMessage → aligned with → Orchestrator agent_messages table
```

Fields mapped:
- `processing_status`: pending | processing | completed | failed | dead_letter
- `processing_lane`: agent ID for lane-based SKIP LOCKED queue
- `parent_message_id`: for conversation threading
- `token_count`, `latency_ms`: performance metrics
- `provider_used`: actual provider after failover
- `failover_reason`: from 6-category classification
- `failed_count`: retry tracking
- `evidence_id`: UUID linking to Evidence Vault

### 3.2 Failover (failover.ts)

Abort Matrix aligned with ADR-056 Decision 3:

| Category | Action | Retry |
|----------|--------|-------|
| auth | ABORT | 0 |
| billing | ABORT | 0 |
| rate_limit | FALLBACK | 0 |
| timeout | FALLBACK | 0 |
| format | RETRY | 1 |
| unknown | ABORT | 0 |

Provider Profile Key format: `{provider}:{account}:{region}:{model_family}`

### 3.3 Input Sanitizer (input-sanitizer.ts)

12 patterns per ADR-056 Non-Negotiable #4:
1. System prompt extraction
2. Instruction override (ignore/forget/disregard previous)
3. Role manipulation (you are now, act as)
4. Response format manipulation
5. Context window manipulation
6. Tool/function call injection
7. Delimiter injection (```)
8. Encoding evasion (unicode, homoglyph)
9. Multi-turn memory manipulation
10. Chat-ML delimiter injection (`<|im_sep|>`, `<|system|>`)
11. Base64 payload detection
12. Prompt leaking (repeat/show system prompt)

### 3.4 Shell Guard (shell-guard.ts)

8 deny patterns per ADR-056 Section 10.2:
1. `rm -rf /` — filesystem destruction
2. `:(){ :|:& };:` — fork bomb
3. `mkfs` — filesystem format
4. `dd if=` — raw disk write
5. `> /dev/sd` — device write
6. `shutdown|reboot|halt|poweroff` — system control
7. `chmod 777` — permission escalation
8. `curl.*\|.*sh` — remote code execution

Additional: `eval\s*\(` (eval injection), `fdisk` (disk operations), `truncateOutput()` (10KB limit)

---

## 4. The Trinity Architecture

### 4.1 Three-Product Ecosystem

```
┌─────────────────────────────────────────────────────────────────┐
│                   SDLC Enterprise Framework v6.0.6              │
│              (Methodology Layer — vendor-neutral)               │
│                                                                 │
│  10 Stages (00-09) · Quality Gates (G0.1-G4) · 4-Tier Class.  │
│  SE4A/SE4H · Role Definitions · Templates · Best Practices     │
└──────────────────┬────────────────────┬─────────────────────────┘
                   │                    │
     ┌─────────────┴──────┐   ┌────────┴──────────────┐
     │     TinySDLC       │   │   SDLC Orchestrator    │
     │  (Community Tool)  │   │   (Enterprise Tool)    │
     │                    │   │                        │
     │  Multi-agent AI    │   │  Governance Platform   │
     │  orchestrator for  │   │  for large/complex     │
     │  individuals and   │   │  projects with full    │
     │  small teams       │   │  gate engine, evidence │
     │                    │   │  vault, policy-as-code │
     │  Open Source (MIT) │   │  Apache 2.0            │
     └────────────────────┘   └────────────────────────┘
```

### 4.2 Scope Boundaries

| Capability | TinySDLC | SDLC Orchestrator |
|-----------|----------|-------------------|
| **Target** | Individuals, small teams | Enterprises, complex projects |
| **SDLC Tier** | LITE (1-2 devs) | STANDARD/PROFESSIONAL/ENTERPRISE |
| **Agents** | 8 SDLC roles (SE4A) | 8 SDLC + CEO/CPO/CTO roles |
| **Governance** | File-based, trust model | Gate Engine + OPA policies |
| **Evidence** | Local workspace files | Evidence Vault (MinIO S3, SHA256) |
| **Channels** | Discord, Telegram, WhatsApp, Zalo | Web Dashboard, API, CLI |
| **AI Providers** | Claude, Codex, Ollama | Multi-provider with EP-06 Codegen |
| **Quality Gates** | Convention-based (agent prompts) | Enforced (policy-as-code) |
| **Audit** | Event logs (JSON files) | Immutable audit trail (PostgreSQL) |
| **Protocol** | Canonical messages (local) | agent_messages table (SKIP LOCKED) |

### 4.3 Integration Points

TinySDLC connects to SDLC Orchestrator via:

1. **Canonical Protocol** (`protocol-adapter.ts`): Message format aligned with `agent_messages` table schema — same fields, same semantics, ready for wire protocol when Orchestrator endpoint is available
2. **Failover** (`failover.ts`): Same 6-category error classification and abort matrix as Orchestrator's provider gateway
3. **Input Sanitizer** (`input-sanitizer.ts`): Same 12 patterns as Orchestrator's OTT sanitization layer
4. **Shell Guard** (`shell-guard.ts`): Same 8 deny patterns as Orchestrator's execution sandbox

Integration is **gated** by `orchestrator_integration.enabled` (default: false) in settings. When enabled, TinySDLC can forward canonical messages to an Orchestrator endpoint.

---

## 5. Files Modified (10 files, +486/-48 lines)

| File | Changes |
|------|---------|
| `src/lib/protocol-adapter.ts` | ADR-056 canonical schema alignment |
| `src/lib/failover.ts` | 6-category classification + ProviderProfileKey |
| `src/lib/input-sanitizer.ts` | 12 injection patterns |
| `src/lib/shell-guard.ts` | 8 deny patterns + truncateOutput |
| `src/lib/types.ts` | SDLC_ROLES: 6 → 8 (added researcher, pjm) |
| `templates/settings.sdlc-default.json` | 8 agents + 4 teams default config |
| `templates/agents/researcher/AGENTS.md` | New: Researcher role template |
| `templates/agents/pjm/AGENTS.md` | New: Project Manager role template |
| `lib/sdlc.sh` | Roles table, init, reinit updated for 8 roles |
| `lib/setup-wizard.sh` | Auto-apply SDLC defaults + 8 agents display |

---

## 6. Recommendations for SDLC Orchestrator

### 6.1 Immediate Actions

1. **Wire Protocol**: Define REST/gRPC endpoint for TinySDLC → Orchestrator message forwarding (canonical protocol is ready)
2. **Provider Profiles**: Share provider profile registry so TinySDLC can use Orchestrator's Ollama instance at `api.nhatquangholding.com`
3. **Evidence Bridge**: Define API for TinySDLC to submit file-based evidence to Orchestrator's Evidence Vault

### 6.2 Future Alignment

1. **Gate Evaluation API**: TinySDLC agents could call Orchestrator's gate evaluation endpoint before passing gates
2. **Shared Sanitization Rules**: Maintain a single source of truth for injection patterns (currently duplicated)
3. **Telemetry**: TinySDLC event logs could feed into Orchestrator's Prometheus metrics

---

## 7. Conclusion

TinySDLC is positioned as the **community tool** in the trinity ecosystem. It operationalizes the SDLC Enterprise Framework v6.0.6 for individuals and small teams using AI-powered agents. The ADR-056 alignment ensures protocol compatibility with SDLC Orchestrator, enabling a smooth upgrade path for teams that grow beyond LITE tier.

The three products together — **SDLC Framework** (methodology), **TinySDLC** (community orchestration), and **SDLC Orchestrator** (enterprise governance) — enable developing applications at any scale with AI tools while maintaining quality gates and human oversight.

---

**Report Status**: Complete
**Next Review**: Weekly CTO Sync
