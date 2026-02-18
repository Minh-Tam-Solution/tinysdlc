# CTO Directive: SDLC Ecosystem Strategic Upgrade — TinySDLC Team

**Directive ID**: CTO-2026-002
**Date**: February 17, 2026
**From**: CTO Office
**To**: TinySDLC Development Team
**Status**: APPROVED — Effective Immediately
**Classification**: Internal — All Hands
**ADR Reference**: ADR-056 (SDLC-Orchestrator, pending creation Sprint 176)

---

## 1. Executive Summary

The CTO has approved the **SDLC Ecosystem Strategic Upgrade Plan v4 (FINAL)** after 4 review rounds analyzing 3 external codebases (TinyClaw, OpenClaw, NanoBot). This directive communicates what TinySDLC team needs to know, what changes are coming, and what actions are required from your side.

**Bottom line**: TinySDLC becomes the **lightweight standalone product** in a 3-product ecosystem. Your patterns are being absorbed into the enterprise platform (SDLC Orchestrator). In return, you receive upgrades from OpenClaw and NanoBot patterns. No breaking changes to your current architecture.

### 3-Product Architecture (CEO Decision)

| Product | Role | Tech | Tier |
|---------|------|------|------|
| **SDLC Framework 6.1.0** | Methodology — templates, governance rules, AI principles | Markdown/YAML | All tiers |
| **TinySDLC** (you) | Lightweight standalone — file-queue, OTT channels, CLI agents | Node.js, TypeScript | LITE |
| **SDLC Orchestrator** | Enterprise governed — PostgreSQL, Redis, OPA, Evidence Vault | Python, FastAPI | PROFESSIONAL+ |

---

## 2. What This Means for TinySDLC

### 2.1 Your Patterns That Were Absorbed into Orchestrator

The following patterns from your codebase were recognized as production-proven and will be implemented in SDLC Orchestrator's new Multi-Agent Team Engine:

| Your Pattern | Source File | Orchestrator Implementation |
|-------------|-------------|---------------------------|
| File-based message queue | `src/queue-processor.ts:120-350` | Lane-based PostgreSQL queue with SKIP LOCKED |
| `@mention` routing | `src/lib/routing.ts` | `mention_parser.py` — same `[@agent: message]` syntax |
| 50-msg conversation loop cap | `src/queue-processor.ts:380-480` | `conversation_tracker.py` — 6 loop guards (your 50-msg is one of them) |
| Branch counting | `src/queue-processor.ts` | `branch_count` column in `agent_conversations` table |
| Provider abstraction | `src/lib/invoke.ts` | `agent_invoker.py` with FailoverError classification |
| SDLC role templates | `src/lib/types.ts:60-90` | `sdlc_role` enum in `agent_definitions` (pm/architect/coder/reviewer/tester/devops) |
| Hot-reload config | `settings.json` re-read | DB-backed config + Redis pub/sub invalidation |
| Team events | `agentStart/agentComplete/conversationEnd` | WebSocket event types + correlation_id tracing |

**Recognition**: Your team built the right abstractions first. The Orchestrator is scaling them to enterprise grade, not replacing them.

### 2.2 Upgrades Coming TO TinySDLC (From OpenClaw + NanoBot)

These patterns will be added to TinySDLC in upcoming sprints. They are **optional but recommended**:

| Pattern | Source | What You Get | Priority |
|---------|--------|-------------|----------|
| Plugin-based channel architecture | OpenClaw | Replace hardcoded Telegram/Discord/WhatsApp with `ChannelPlugin` interface | P1 |
| FailoverError classification | OpenClaw | Better error handling: 6 reasons (auth/format/rate_limit/billing/timeout/unknown) | P1 |
| Session scoping | OpenClaw | Support `per-sender` vs `global` conversation scoping | P2 |
| Shell safety guards | NanoBot | 8 deny regex patterns (rm -rf, fork bomb, shutdown) for agent CLI execution | **P0** |
| Subagent isolation | NanoBot | Restrict tool sets for delegated agents (no spawn-in-spawn) | P1 |
| Skills system | OpenClaw | Metadata-driven tool discovery (50+ skills pattern) | P2 |
| Device pairing | OpenClaw | Secure remote access to TinySDLC gateway | P2 |

### 2.3 What Stays the Same

- **File-based queue** — remains your core architecture. No migration to PostgreSQL.
- **CLI-based agent invocation** — Claude CLI, Codex CLI, Ollama REST stay as-is.
- **Channel clients** — `src/channels/telegram-client.ts`, `discord-client.ts`, `whatsapp-client.ts` continue unchanged.
- **SDLC tier** — TinySDLC remains LITE tier. No OPA, no Evidence Vault, no PostgreSQL required.
- **Install flow** — `curl | bash` one-liner unchanged.

---

## 3. Required Actions (TinySDLC Team)

### ACTION 1: Shell Safety Guards — P0, Sprint 176 (Mar 17-28)

**WHY**: Agents execute CLI commands (`claude --dangerously-skip-permissions`, `codex exec --dangerously-bypass-approvals-and-sandbox`). Without shell guards, a malicious prompt can make an agent run `rm -rf /` or worse.

**WHAT**: Add a `shell-guard.ts` module to `src/lib/` with deny-pattern checking before any CLI invocation.

**Spec** (from NanoBot `nanobot/agent/tools/shell.py`):

```typescript
// src/lib/shell-guard.ts

const DENY_PATTERNS: RegExp[] = [
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--no-preserve-root)/,  // rm -rf
  /:\(\)\{.*\|.*&\s*\};\s*:/,                               // fork bomb
  /mkfs\./,                                                   // format disk
  /dd\s+if=.*of=\/dev\//,                                    // disk overwrite
  />\s*\/dev\/sd[a-z]/,                                       // device write
  /shutdown|reboot|init\s+[06]/,                              // system shutdown
  /chmod\s+(-[a-zA-Z]*\s+)?[0-7]*777/,                       // world-writable
  /curl.*\|\s*(ba)?sh/,                                       // pipe to shell
];

export function guardCommand(command: string): { allowed: boolean; reason?: string } {
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Blocked by deny pattern: ${pattern.source}` };
    }
  }
  // Path traversal check
  if (/\.\.[\/\\]/.test(command) && !isWithinWorkspace(command)) {
    return { allowed: false, reason: 'Path traversal outside workspace detected' };
  }
  return { allowed: true };
}
```

**Integration point**: Call `guardCommand()` in `src/lib/invoke.ts` BEFORE spawning CLI process. If blocked, return error message to user via outgoing queue.

**Deadline**: Sprint 176, Day 3 (Mar 19).

---

### ACTION 2: Canonical Protocol Compliance — P0, Sprint 176

**WHY**: SDLC Orchestrator is the **canonical protocol owner**. When TinySDLC integrates with Orchestrator (as proposed in `docs/03-integrate/sdlc-orchestrator-proposal.md`), your messages must conform to the canonical schema.

**WHAT**: The Orchestrator will publish its message schema as part of ADR-056. Your existing `IncomingMessage` / `OutgoingMessage` types in `src/lib/types.ts` should include mapping functions to/from the canonical format.

**Key fields in canonical protocol**:

```typescript
// Orchestrator's canonical message format (simplified)
interface CanonicalAgentMessage {
  id: string;                          // UUID
  conversation_id: string;             // UUID
  sender_type: 'user' | 'agent' | 'system';
  sender_id: string;
  recipient_id: string;
  content: string;
  mentions: string[];                  // Parsed @agent mentions
  message_type: 'request' | 'response' | 'mention' | 'system' | 'interrupt';
  queue_mode: 'queue' | 'steer' | 'interrupt';
  correlation_id: string;             // Request tracing
  dedupe_key?: string;                // Idempotency
  created_at: string;                 // ISO 8601
}
```

**Action**: Create `src/lib/protocol-adapter.ts` with `toCanonical()` and `fromCanonical()` functions. Use when Orchestrator integration is enabled (gated by `sdlc-config.json` flag).

**Deadline**: Sprint 177, Day 7 (Apr 7). Blocked on ADR-056 publication.

---

### ACTION 3: Plugin-Based Channel Architecture — P1, Sprint 178+

**WHY**: Your current channels are 3 separate files (`telegram-client.ts`, `discord-client.ts`, `whatsapp-client.ts`) with duplicated poll-and-deliver logic. OpenClaw's plugin architecture supports 36 channels with zero core changes.

**WHAT**: Extract common channel behavior into a `ChannelPlugin` interface. Existing channels become plugins that implement this interface.

**Spec** (adapted from OpenClaw `src/channels/plugins/types.plugin.ts`):

```typescript
// src/lib/channel-plugin.ts

export interface ChannelPlugin {
  id: string;                                    // "telegram", "discord", "whatsapp"
  meta: { name: string; icon: string; version: string };
  capabilities: {
    threading: boolean;       // Supports message threads
    reactions: boolean;       // Supports emoji reactions
    fileAttachments: boolean; // Supports files
    maxMessageLength: number; // Character limit
  };

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Outbound: send response to user
  sendMessage(chatId: string, content: string, opts?: {
    replyToMessageId?: string;
    attachments?: Buffer[];
  }): Promise<void>;

  // Inbound: register message handler
  onMessage(handler: (msg: IncomingMessage) => void): void;

  // Lifecycle
  onReady?(handler: () => void): void;
  onError?(handler: (error: Error) => void): void;
}
```

**Migration path**:
1. Create `src/lib/channel-plugin.ts` (interface definition)
2. Create `src/channels/plugins/telegram.ts` (implements ChannelPlugin)
3. Create `src/channels/plugins/discord.ts` (implements ChannelPlugin)
4. Create `src/channels/plugins/whatsapp.ts` (implements ChannelPlugin)
5. New `src/channels/plugin-loader.ts` reads `settings.json` and loads enabled plugins
6. Original files (`telegram-client.ts`, etc.) become thin wrappers until fully migrated
7. Add new channels (Zalo, Line, Slack) as plugins with zero core changes

**Deadline**: Sprint 178-179 (Apr 14 — May 2).

---

### ACTION 4: FailoverError Classification — P1, Sprint 177

**WHY**: Your `src/lib/invoke.ts` currently catches errors as generic failures. OpenClaw classifies every provider error into 6 categories, enabling smart retry/fallback behavior.

**WHAT**: Add error classification to `invoke.ts`:

```typescript
// src/lib/failover.ts

export type FailoverReason = 'auth' | 'format' | 'rate_limit' | 'billing' | 'timeout' | 'unknown';

export interface FailoverError {
  reason: FailoverReason;
  provider: string;
  statusCode?: number;
  message: string;
  retryable: boolean;
}

export function classifyError(error: any, provider: string): FailoverError {
  const status = error.status || error.statusCode;
  const msg = error.message || String(error);

  if (status === 401 || status === 403) return { reason: 'auth', provider, statusCode: status, message: msg, retryable: false };
  if (status === 402) return { reason: 'billing', provider, statusCode: status, message: msg, retryable: false };
  if (status === 429) return { reason: 'rate_limit', provider, statusCode: status, message: msg, retryable: true };
  if (status === 408 || /timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(msg)) return { reason: 'timeout', provider, statusCode: status, message: msg, retryable: true };
  if (status === 400) return { reason: 'format', provider, statusCode: status, message: msg, retryable: true };

  return { reason: 'unknown', provider, statusCode: status, message: msg, retryable: false };
}

// Abort matrix:
// auth     → ABORT (credential issue)
// billing  → ABORT (payment issue)
// rate_limit → FALLBACK to next provider
// timeout  → FALLBACK to next provider
// format   → RETRY 1x with same provider (likely prompt issue)
// unknown  → ABORT + log for investigation
```

**Deadline**: Sprint 177, Day 5 (Apr 3).

---

### ACTION 5: Subagent Delegation Depth Guard — P1, Sprint 177

**WHY**: Your team collaboration uses `[@teammate: message]` tags which can create infinite loops. Current 50-msg cap catches this, but the NanoBot pattern is more surgical — prevent agents from spawning sub-sub-agents entirely.

**WHAT**: In `src/queue-processor.ts`, track delegation depth for inter-agent messages:

```typescript
// When routing an [@agent: message] tag:
const currentDepth = message.metadata?.delegation_depth || 0;
const maxDepth = agentConfig.max_delegation_depth ?? 1; // default: 1 level of delegation

if (currentDepth >= maxDepth) {
  // Return error to originating agent instead of routing
  return createErrorResponse(
    `Delegation depth limit reached (${maxDepth}). Cannot delegate further.`,
    message
  );
}

// When creating the delegated message:
delegatedMessage.metadata = {
  ...delegatedMessage.metadata,
  delegation_depth: currentDepth + 1,
  parent_conversation_id: message.conversation_id,
};
```

**Deadline**: Sprint 177, Day 6 (Apr 4).

---

## 4. NON-REQUIRED but Recommended Upgrades

These are enhancements from the ecosystem upgrade that would improve TinySDLC quality but are not blocking:

| Upgrade | Source | Effort | Benefit |
|---------|--------|--------|---------|
| Input sanitization (12 regex) | OpenClaw | ~2h | Prevent prompt injection via OTT channels |
| Reflect-after-tools | NanoBot | ~1h | Agents self-correct after tool execution errors |
| Error-as-string for LLM | NanoBot | ~1h | Return errors as content (not exceptions) so agents can self-correct |
| Token budget tracking | OpenClaw | ~4h | Track input/output/total tokens per conversation |
| Two-layer memory (facts + timeline) | NanoBot | ~8h | Long-running agents don't lose context after consolidation |
| DM pairing policy | OpenClaw | ~2h | Require approval before unknown OTT senders can interact |

---

## 5. Integration Timeline

```
Sprint 176 (Mar 17-28) — SDLC Orchestrator creates ADR-056
├── TinySDLC ACTION 1: Shell safety guards (P0)
├── TinySDLC: Review ADR-056 when published
└── TinySDLC: Begin protocol-adapter.ts design

Sprint 177 (Mar 31 - Apr 11) — Orchestrator builds Multi-Agent services
├── TinySDLC ACTION 2: Canonical protocol compliance
├── TinySDLC ACTION 4: FailoverError classification
├── TinySDLC ACTION 5: Delegation depth guard
└── TinySDLC: Test Orchestrator REST API integration (4 endpoints from original proposal)

Sprint 178 (Apr 14-25) — Orchestrator OTT Gateway + TinySDLC Plugin Architecture
├── TinySDLC ACTION 3: Plugin-based channels (start)
├── Joint testing: TinySDLC ↔ Orchestrator REST integration
└── Telegram plugin as first ChannelPlugin implementation

Sprint 179+ (May onwards) — Expansion
├── TinySDLC: Discord/WhatsApp as ChannelPlugins
├── TinySDLC: Zalo plugin (Vietnam market)
└── TinySDLC: Progressive skills system (P2)
```

---

## 6. Architectural Constraints (Non-Negotiable)

The following constraints come from the CTO-approved v4 plan.  **TinySDLC must comply**:

### 6.1 Canonical Protocol Owner = SDLC Orchestrator

Orchestrator defines the canonical message protocol. TinySDLC is a **client** that speaks this protocol when integrated. TinySDLC does NOT define its own protocol extensions without CTO approval.

**Implication**: `src/lib/types.ts` message types are your internal format. When communicating with Orchestrator, use `protocol-adapter.ts` to translate. Never send raw internal format to Orchestrator endpoints.

### 6.2 Shell Command Guard is MANDATORY

Any agent that executes CLI commands (which is ALL of your agents) MUST have deny-pattern checking. This is a **P0 security non-negotiable**.

The 8 deny patterns are minimum. You MAY add more. You MAY NOT remove any.

### 6.3 Delegation Depth Limit

Max delegation depth is configurable per agent. Default is 1 (an agent can delegate to one other agent, but that agent cannot delegate further). Setting `max_delegation_depth: 0` means the agent cannot delegate at all.

This replaces relying solely on the 50-msg cap for loop prevention. The 50-msg cap remains as a secondary safety net.

### 6.4 Snapshot Precedence

When TinySDLC reads agent config from `settings.json`, the values at conversation-start are **authoritative** for that conversation. Hot-reloading config mid-conversation is allowed for NEW conversations only. Changing `max_messages` in settings while a conversation is active does NOT affect that conversation.

**Your current behavior**: `settings.json` is re-read on every message. This must be changed — snapshot config on conversation-start, use snapshot for the conversation lifetime.

### 6.5 External Content Sanitization

All user input from OTT channels (Telegram, Discord, WhatsApp) must be sanitized before injection into agent context. This prevents prompt injection attacks.

**Minimum**: Strip known injection patterns (system prompt override attempts, role-switching commands). The Orchestrator's `input_sanitizer.py` will provide the canonical regex list.

---

## 7. Communication Protocol

### Who to Contact
- **Architecture questions**: CTO Office (this directive's author)
- **API contract questions**: SDLC Orchestrator team (via GitHub Issues on `SDLC-Orchestrator` repo)
- **Timeline adjustments**: Request via CTO Office with justification

### Review Checkpoints
- **Sprint 176 Day 5**: Shell guard implementation review (TinySDLC → CTO)
- **Sprint 177 Day 8**: Protocol adapter + failover classification review (TinySDLC → CTO)
- **Sprint 178 Day 7**: Plugin architecture + joint integration test report (TinySDLC + Orchestrator → CTO)

### Document Updates
This directive will be updated when:
- ADR-056 is published (adds exact API contract schemas)
- Sprint 177 joint testing reveals integration issues
- New patterns are identified that affect TinySDLC

---

## 8. Appendix: Files Affected

### New Files (TinySDLC)
| File | Priority | Sprint | LOC Est. |
|------|----------|--------|----------|
| `src/lib/shell-guard.ts` | P0 | 176 | ~60 |
| `src/lib/protocol-adapter.ts` | P0 | 177 | ~100 |
| `src/lib/failover.ts` | P1 | 177 | ~80 |
| `src/lib/channel-plugin.ts` | P1 | 178 | ~50 |
| `src/channels/plugins/telegram.ts` | P1 | 178 | ~150 |
| `src/channels/plugins/discord.ts` | P1 | 179 | ~150 |
| `src/channels/plugins/whatsapp.ts` | P1 | 179 | ~150 |
| `src/channels/plugin-loader.ts` | P1 | 178 | ~80 |

### Modified Files (TinySDLC)
| File | Change | Sprint |
|------|--------|--------|
| `src/lib/invoke.ts` | Add `guardCommand()` call before CLI spawn + failover classification | 176-177 |
| `src/queue-processor.ts` | Add delegation depth tracking + snapshot config on conversation-start | 177 |
| `src/lib/types.ts` | Add `delegation_depth`, `correlation_id`, `dedupe_key` to message types | 177 |
| `src/lib/config.ts` | Add `max_delegation_depth`, `shell_guard_enabled` to agent config | 176 |

### Total Estimated Impact
- New LOC: ~820
- Modified LOC: ~150
- New files: 8
- Modified files: 4
- No breaking changes to existing user-facing CLI or message flow

---

**Signed**: CTO Office
**Date**: February 17, 2026
**Review Cycle**: v4 FINAL — No further CTO review until Sprint 176 Day 5 checkpoint

---

*This document is part of the SDLC Ecosystem Strategic Upgrade Plan. The canonical source of truth is ADR-056 in the SDLC-Orchestrator repository (to be published Sprint 176, Day 6).*
