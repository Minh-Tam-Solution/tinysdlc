# TinySDLC - ADR: ZeroClaw Security & UX Patterns

**SDLC Version**: 6.1.0
**Stage**: 02 - DESIGN
**Status**: Active
**Authority**: CTO Approved
**Date**: 2026-02-19

---

## Context

TinySDLC processes user messages from OTT channels (Telegram, WhatsApp, Discord) and forwards them to AI agents (Claude CLI, Codex CLI, Ollama). The current security stack includes:

- **Input sanitization** (`input-sanitizer.ts`) — strips 12 prompt injection patterns
- **Shell guards** (`shell-guard.ts`) — blocks 8 destructive CLI patterns
- **Failover classification** (`failover.ts`) — classifies provider errors into 6 categories

However, three security gaps remain:

1. **Credential leakage**: Users can accidentally paste API keys, connection strings, or PEM keys in messages. These flow unmodified to AI agents, which may log or echo them.
2. **Environment exposure**: The parent process environment (containing `GITHUB_TOKEN`, `DATABASE_URL`, etc.) is inherited by child processes. Only `CLAUDECODE` is currently scrubbed.
3. **No message classification**: All messages are treated identically — no distinction between commands, questions, code requests, or casual conversation.

Additionally, two UX gaps impact usability:

4. **Silent processing**: Users see no feedback during 1-15 minute agent processing windows.
5. **Unbounded conversation history**: Team conversations can accumulate large response chains without content-aware compaction.

**Source**: SDLC Orchestrator team's ZeroClaw research report identified 7 patterns; 5 are applicable to TinySDLC's architecture.

---

## Decision

Implement 3 ZeroClaw patterns (A, C, F) as Sprint S04. Patterns E (Query Classification) and B (History Compaction) were cancelled per CTO over-engineering audit — not required for LITE tier. All delivered modules follow the established `input-sanitizer.ts` pattern (exported const array + pure function + typed result interface). All features are backward-compatible with config toggles.

---

## Architectural Decisions

### ADR-008: Credential Scrubbing as Separate Module (Pattern A)

**Decision**: Create `src/lib/credential-scrubber.ts` as a standalone module, separate from `input-sanitizer.ts`. Invoke it in `queue-processor.ts` immediately after input sanitization, for external messages only.

**Rationale**: Input sanitization and credential scrubbing serve different purposes:
- Input sanitization prevents **prompt injection** (malicious intent)
- Credential scrubbing prevents **accidental leakage** (user mistake)

Keeping them separate allows independent enable/disable and avoids conflating security concerns.

**Alternatives considered**:
- Extend `INJECTION_PATTERNS` in `input-sanitizer.ts` → mixes concerns, harder to toggle independently
- Scrub in `invoke.ts` before provider call → misses logging opportunity, happens too late in pipeline

**Trade-offs**: One additional import in `queue-processor.ts`. Acceptable for separation of concerns.

**Implementation note — threshold `{16,}` for known provider patterns**: During implementation, the minimum character threshold for `sk-ant-` and `sk-proj-` patterns was set to `{16,}` (not `{20,}`). Rationale: real Anthropic/OpenAI keys always exceed 16 chars; a 16-char minimum avoids false negatives on keys with shorter random segments while still avoiding false positives on common short strings. The generic `sk-[A-Za-z0-9]{20,}` fallback retains `{20,}` as a higher bar to reduce false positives on non-provider `sk-` strings.

---

### ADR-009: Environment Scrubbing with Explicit Preserve List (Pattern C)

**Decision**: Create `src/lib/env-scrubber.ts` that removes sensitive environment variables from the child process environment before spawning AI CLIs. Use a `PRESERVE_LIST` to explicitly protect variables that must survive (including provider authentication keys).

**Rationale**: The parent shell environment often contains secrets unrelated to agent operation (GitHub tokens, database passwords, Slack webhooks). These should not be inherited by AI CLI subprocesses.

**Critical constraint**: Provider authentication keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) MUST be preserved — they are required for Claude CLI and Codex CLI to authenticate. The `PRESERVE_LIST` explicitly includes these.

**Alternatives considered**:
- Allowlist approach (only pass listed vars) → too fragile, breaks when new required vars are added
- Config toggle per var → over-engineered for the problem; `PRESERVE_LIST` constant is sufficient

**Trade-offs**: Always-on (no config toggle). The `PRESERVE_LIST` serves as the escape hatch. If a developer needs a specific env var in agent subprocesses, they add it to the preserve list.

**Implementation note — `Set<string>` for O(1) lookup**: `SENSITIVE_EXACT` is implemented as `Set<string>` rather than `string[]`. This changes lookup from O(n) `Array.includes()` to O(1) `Set.has()`. Negligible for 30 entries but better at scale; consistent with `PRESERVE_LIST` which was already a Set.

**Implementation note — 8 suffix patterns**: `SENSITIVE_PATTERNS` has 8 regex entries: `_SECRET`, `_TOKEN`, `_PASSWORD`, `_PASS`, `_API_KEY`, `_PRIVATE_KEY`, `_CREDENTIAL`, `_CREDENTIALS`. Design docs originally estimated 6; implementation expanded to cover `_CREDENTIAL`/`_CREDENTIALS` variants.

**PRESERVE_LIST must include**:
- Runtime: `PATH`, `HOME`, `USER`, `SHELL`, `LANG`, `LC_ALL`, `TERM`, `TMPDIR`, `TZ`, `LOGNAME`, `PWD`, `OLDPWD`
- Node.js: `NODE_ENV`, `NODE_PATH`, `NODE_OPTIONS`
- TinySDLC: `TINYSDLC_HOME`, `WHATSAPP_ALLOW_SELF`
- Provider auth: `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `CODEX_API_KEY`, `OLLAMA_URL`
- Network: `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `no_proxy`
- Display/session: `DISPLAY`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR`

---

### ~~ADR-010: Regex-Based Query Classification (Pattern E)~~ — CANCELLED

**Status**: Cancelled per CTO over-engineering audit. Regex-based query classification is not required for LITE tier. The pattern was designed but not implemented. Future enhancement for STANDARD+ tier if routing optimization becomes needed.

---

### ADR-011: File-Based Processing Status (Pattern F)

**Decision**: Create `src/lib/processing-status.ts` using file-based status signaling via `queue/status/` directory. Queue processor writes a status file once before agent invocation; channel clients poll the directory and compute elapsed time client-side.

**Rationale**: Consistent with TinySDLC's file-based queue architecture. No new IPC mechanisms needed. Channel clients already poll `queue/outgoing/` every 1 second, so polling `queue/status/` is natural.

**Critical constraint**: The `elapsedMs` field must be computed client-side as `Date.now() - status.startedAt`, NOT read from the status file. The queue processor writes the file once (write-once pattern) to avoid timer-based updates.

**Alternatives considered**:
- WebSocket push → requires new infrastructure, overkill for TinySDLC's architecture
- Periodic file updates → introduces timer complexity in queue processor, race conditions with file writes

**Trade-offs**: Status updates are not real-time (polling interval determines granularity). Acceptable since messages are sent every 30s for long-running tasks.

---

### ~~ADR-012: Deterministic History Compaction (Pattern B)~~ — CANCELLED

**Status**: Cancelled per CTO over-engineering audit. Premature optimization for LITE tier. The existing 50-message conversation cap is sufficient. Future enhancement if conversation context size becomes a measurable bottleneck.

---

### ADR-013: ChannelPlugin Bridge via File Queue (Zalo OA Integration)

**Decision**: New channels (Zalo OA, Zalo Personal) are integrated via the `ChannelPlugin` interface and bridged to the existing file queue through two functions in `queue-processor.ts`: `writeMessageToIncoming()` (inbound) and `deliverPluginResponses()` (outbound). No new queue infrastructure is introduced.

**Rationale**: Consistent with TinySDLC's file-based queue architecture (ADR-011). All messages — regardless of source — flow through the same `queue/incoming/` → `queue/processing/` → `queue/outgoing/` pipeline. This means agent routing, team conversation handling, and credential scrubbing apply uniformly to plugin-originated messages.

**Implementation notes discovered during Zalo OA integration (2026-02-19)**:

1. **API response is a single object, not an array**: The Zalo Bot Platform API `getUpdates` response has the shape `{ok: true, result: {...}}` where `result` is a single update object. Code must handle both cases: `Array.isArray(raw) ? raw : (raw ? [raw] : [])`.

2. **Field name is `event_name`, not `event`**: Zalo uses `result.event_name = "message.text.received"`. The `processUpdate` handler must check `update.event_name || update.event` for forward compatibility.

3. **API URL format**: `https://bot-api.zapps.me/bot{token}/{method}` — the token is concatenated directly to "bot" with no separator (e.g., `bot2851716016800897526:xxx/getUpdates`).

4. **HTTP 408 is normal**: The `getUpdates` long-poll endpoint returns 408 when the timeout elapses with no messages. The plugin must NOT treat 408 as an error — reconnect immediately.

5. **Auth config location**: Bot token is stored in `settings.json` at `channels.zalo.token` (not an environment variable). Format: `app_id:secret_key`.

6. **`chatId` guard is mandatory**: `writeMessageToIncoming()` must validate `msg.chatId?.trim()` before writing to queue. A missing or empty chatId would produce outgoing messages with no valid delivery target, causing repeated send failures.

7. **Outbound delete-after-success**: Plugin response files in `queue/outgoing/` are deleted only after `plugin.sendMessage()` resolves successfully. Failed sends retain the file for retry on the next 1s tick.

**Operational finding — queue backlog management**: During testing, 188 heartbeat messages accumulated in `queue/incoming/` from a prior daemon run. Processing this backlog on restart caused event loop saturation: `setInterval` callbacks stopped firing, zombie child processes appeared, and the log stopped updating. Mitigation: clear stale heartbeat messages from `queue/incoming/` before restarting the daemon after a prolonged outage. The daemon does not currently auto-prune old heartbeat messages; this remains an open improvement.

**Alternatives considered**:
- Direct socket IPC between plugin and queue-processor → new infrastructure, inconsistent with file-queue pattern
- Plugin writes directly to `queue/incoming/` without bridge function → loses the chatId guard and couples plugin code to queue internals

**Trade-offs**: One additional `setInterval` loop (`deliverPluginResponses`, 1s) runs in queue-processor. Negligible CPU overhead. Plugin channels share the same event loop as the queue processor, so a blocked event loop affects both.

---

### ADR-014: Cross-Team Agent Routing (v1.1.0)

**Problem**: In v1.0.0, agents can only mention teammates within the same team. `isTeammate()` in `routing.ts` checks `team.agents.includes(mentionedId)` — cross-team mentions are silently dropped. This means coder (team `dev`) cannot escalate to PM (team `planning`); the user must manually re-route between teams, acting as the workflow bridge.

**Decision**: Allow `[@agent_id: msg]` to route to any known agent regardless of team membership. Also allow `[@team_id: msg]` to route to the target team's leader. Add circular detection and enforce delegation depth limits.

**Mention resolution order** (in `resolveTarget()`):
1. Same-team agent (existing `isTeammate()` check — fastest path)
2. Cross-team agent (agent exists in config but not in current team)
3. Team ID → team leader agent (e.g., `[@planning: msg]` → PM as planning leader)
4. `null` if target not found (mention silently dropped, same as v1.0.0)

**Safety guards**:
- **Circular detection**: `Conversation.agentsInChain: Set<string>` tracks all agents who have participated. If target is already in the set, mention is blocked with log `Circular delegation blocked: A → B`.
- **Delegation depth**: Existing `max_delegation_depth` (default 5) applies across all teams — depth increments on every handoff regardless of team boundary.
- **Conversation cap**: Existing 50-message limit applies to the entire conversation including cross-team branches.
- **Self-mention blocked**: Agent cannot mention itself (existing guard in `isTeammate()`).

**Implementation**:
- `routing.ts`: New `resolveTarget()` function replaces `isTeammate()` in mention extraction. `extractTeammateMentions()` gains `agentsInChain?: Set<string>` parameter.
- `types.ts`: `Conversation` interface gains `agentsInChain: Set<string>`.
- `queue-processor.ts`: Initialize `agentsInChain` on conversation start. Add current agent to set before extracting mentions. Log `[CROSS-TEAM]` prefix for cross-team handoffs.

**Consequences**:
- Agents can escalate (coder→pm), request reviews (pm→architect), and delegate across team boundaries
- Team conversations may now involve agents from multiple teams — responses are still aggregated into a single conversation
- The `teamContext` on the conversation remains the originating team (for logging and event emission) — it does not change mid-conversation
- No new files created; all changes in existing routing.ts, types.ts, queue-processor.ts

**Alternatives considered**:
- Create sub-conversations per team → too complex for v1.1.0, breaks response aggregation
- Require explicit syntax `[@team/agent: msg]` → unnecessary friction, agent IDs are globally unique
- Port full OpenClaw workflow engine (S22-S25, 8,300 lines) → overkill for LITE tier community release

---

## Consequences

### Positive

- **Security hardening**: Credential leakage and environment exposure risks eliminated before community release
- **Operational visibility**: Query classification enables analytics and future routing optimization
- **UX improvement**: Users get feedback during long processing windows instead of silence
- **Architecture consistency**: All 5 modules follow the established `input-sanitizer.ts` pattern

### Negative / Risks

- **False positives (Pattern A)**: Overly broad credential patterns may redact legitimate message content. Mitigated by specific patterns first, generic fallbacks last.
- **Env breakage (Pattern C)**: Aggressive env scrubbing could break unforeseen tool dependencies. Mitigated by explicit `PRESERVE_LIST` with all known required vars.
- **Status file cleanup (Pattern F)**: If queue processor crashes, orphaned status files remain. Mitigated by channel clients ignoring status files older than 20 minutes.

### Out of Scope (this ADR)

- LLM-based classification or summarization (future enhancement)
- Pattern D (Dual-Mode Tool Dispatch) — CLI tools handle this natively
- Pattern G (Approval Flow) — TinySDLC already has pairing system
- Partial response streaming from agent subprocess

---

## Implementation Reference

| Component | File | Change | Status |
|-----------|------|--------|--------|
| Credential scrubber | `src/lib/credential-scrubber.ts` | New module (11 regex patterns) | **Delivered** |
| Env scrubber | `src/lib/env-scrubber.ts` | New module (20+ sensitive vars as `Set<string>`, 8 suffix patterns, preserve list) | **Delivered** |
| ~~Query classifier~~ | ~~`src/lib/query-classifier.ts`~~ | ~~New module (5 categories, weighted patterns)~~ | ~~CANCELLED~~ |
| Processing status | `src/lib/processing-status.ts` | New module (file-based IPC) | **Delivered** |
| ~~History compactor~~ | ~~`src/lib/history-compactor.ts`~~ | ~~New module (extractive summarization)~~ | ~~CANCELLED~~ |
| Queue processor | `src/queue-processor.ts` | Hook points for A (external block); F (writeStatus/clearStatus around invokeAgent); ADR-013: `initPlugins()`, `writeMessageToIncoming()`, `deliverPluginResponses()` | **Delivered** |
| Agent invocation | `src/lib/invoke.ts` | Replace env cleanup (lines 36-37) with `scrubEnv()` | **Delivered** |
| Types | `src/lib/types.ts` | Config flags (`credential_scrubbing_enabled`, `processing_status_enabled`) + `channels.zalo` + `channels.zalouser` | **Delivered** |
| Telegram client | `src/channels/telegram-client.ts` | Status polling in typing refresh loop | **Delivered** |
| WhatsApp client | `src/channels/whatsapp-client.ts` | Status polling | **Delivered** |
| Discord client | `src/channels/discord-client.ts` | Status polling | **Delivered** |
| Zalo OA plugin | `src/channels/plugins/zalo.ts` | ADR-013: `ZaloPlugin` — long-poll bridge, single-object response parsing, `event_name` field | **Delivered** |
| Zalo Personal plugin | `src/channels/plugins/zalouser.ts` | ADR-013: `ZaloUserPlugin` — zca-cli subprocess wrapper with JSON-line streaming | **Delivered** |
