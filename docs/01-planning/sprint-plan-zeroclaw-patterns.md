# TinySDLC - Sprint Plan: ZeroClaw Security & UX Patterns

**SDLC Version**: 6.1.0
**Stage**: 01 - PLANNING
**Status**: Active
**Authority**: CTO Conditional Approval (2 fixes applied)
**Date**: 2026-02-19
**Sprint**: S04 — ZeroClaw Patterns
**ADR**: [ADR: ZeroClaw Security Patterns](../02-design/adr-zeroclaw-security-patterns.md)

---

## Sprint Goal

Implement 5 ZeroClaw patterns to harden TinySDLC's security posture (credential leakage, environment exposure) and improve UX (processing feedback, query classification, history compaction) before community release.

## Context

The SDLC Orchestrator team researched ZeroClaw patterns and shared findings. 5 of 7 patterns are applicable to TinySDLC:

| Pattern | Category | Priority | Applicable |
|---------|----------|----------|------------|
| A: Credential Scrubbing | Security | P0 | Yes |
| B: History Compaction | Efficiency | P2 | Yes |
| C: Environment Scrubbing | Security | P0 | Yes |
| D: Dual-Mode Tool Dispatch | Architecture | — | No (CLI handles natively) |
| E: Query Classification | Intelligence | P1 | Yes |
| F: Channel Draft/Streaming | UX | P1 | Yes |
| G: Approval Flow | Governance | — | No (pairing system exists) |

All 5 modules follow the established `input-sanitizer.ts` pattern (exported const array + pure function + typed result interface).

---

## Scope

### In Scope (5 Patterns, 4 Phases)

| Phase | Pattern | Priority | New Files | Modified Files |
|-------|---------|----------|-----------|----------------|
| 1 | A: Credential Scrubbing | P0 | `credential-scrubber.ts` | `queue-processor.ts`, `types.ts` |
| 1 | C: Environment Scrubbing | P0 | `env-scrubber.ts` | `invoke.ts` |
| 2 | E: Query Classification | P1 | `query-classifier.ts` | `queue-processor.ts`, `types.ts` |
| 3 | F: Processing Status | P1 | `processing-status.ts` | `queue-processor.ts`, 3 channel clients, `types.ts` |
| 4 | B: History Compaction | P2 | `history-compactor.ts` | `queue-processor.ts`, `types.ts` |

### CTO Fixes Applied

1. **Pattern C PRESERVE_LIST** — Provider auth keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) added to preserve list. Without this, all agent invocations would fail with auth errors.
2. **Pattern F elapsed computation** — `elapsedMs` computed client-side (`Date.now() - startedAt`), not read from stale status file. `formatStatusMessage()` accepts optional `nowMs` parameter.

### Out of Scope

- Pattern D (Dual-Mode Tool Dispatch) — CLI tools handle natively
- Pattern G (Approval Flow) — pairing system already exists
- LLM-based classification or summarization — future enhancement
- Partial response streaming from agent subprocess — future enhancement

### Dependencies

| Dependency | Owner | Status | Impact |
|------------|-------|--------|--------|
| `input-sanitizer.ts` (pattern reference) | S02 | Complete | Template for all new modules |
| `shell-guard.ts` (pattern reference) | S02 | Complete | Env scrubber complements |
| `failover.ts` (pattern reference) | S02 | Complete | Query classifier complements |

---

## Task Breakdown

### Batch 1 — Credential Scrubbing (P0) [Pattern A]

**Goal**: Strip credentials from user messages before agent delivery.

**Spec source**: [ADR-008](../02-design/adr-zeroclaw-security-patterns.md)

**Scope**: External messages only (internal agent-to-agent exempt)

| Task | File | Detail |
|------|------|--------|
| Create credential scrubber module | `src/lib/credential-scrubber.ts` | 11 regex patterns, `ScrubResult` interface, `scrubCredentials()` pure function |
| Add config flag | `src/lib/types.ts` | `credential_scrubbing_enabled?: boolean` in `Settings` |
| Hook into queue processor | `src/queue-processor.ts` | After input sanitization (line 273), before command intercept (line 278) |

**Acceptance**:
- `scrubCredentials('my key is sk-ant-abc123def456ghi789')` → returns `{ content: 'my key is [ANTHROPIC_KEY_REDACTED]', modified: true, credentialsFound: ['Anthropic API key'] }` _(threshold lowered to `{16,}` during implementation — 18-char example now matches)_
- `scrubCredentials('hello world')` → returns `{ content: 'hello world', modified: false, credentialsFound: [] }`
- Log entry `[CRED-SCRUB]` appears when credentials detected _(prefix in code is `[CRED-SCRUB]`, not `[CREDENTIAL-SCRUB]`)_
- Internal messages bypass scrubbing

---

### Batch 2 — Environment Scrubbing (P0) [Pattern C]

**Goal**: Remove sensitive env vars from AI CLI child processes.

**Spec source**: [ADR-009](../02-design/adr-zeroclaw-security-patterns.md)

**Scope**: All `spawn()` calls in `invoke.ts`

| Task | File | Detail |
|------|------|--------|
| Create env scrubber module | `src/lib/env-scrubber.ts` | `SENSITIVE_EXACT` (20+ vars, `Set<string>` for O(1) lookup), `SENSITIVE_PATTERNS` (8 regex), `PRESERVE_LIST`, `scrubEnv()` |
| Replace env cleanup in invoke | `src/lib/invoke.ts` | Replace lines 36-37 (`delete env['CLAUDECODE']`) with `scrubEnv()` call |

**Acceptance**:
- `scrubEnv({ PATH: '/usr/bin', GITHUB_TOKEN: 'ghp_xxx', ANTHROPIC_API_KEY: 'sk-ant-yyy' })` → removes `GITHUB_TOKEN`, preserves `PATH` and `ANTHROPIC_API_KEY`
- Claude CLI still authenticates successfully after env scrubbing
- `DATABASE_URL` NOT present in agent subprocess env
- `ANTHROPIC_API_KEY` IS present in agent subprocess env
- DEBUG log shows count of removed keys

---

### Batch 3 — Query Classification (P1) [Pattern E]

**Goal**: Classify incoming messages for logging and future routing.

**Spec source**: [ADR-010](../02-design/adr-zeroclaw-security-patterns.md)

**Scope**: External messages only, informational in S04

| Task | File | Detail |
|------|------|--------|
| Create query classifier module | `src/lib/query-classifier.ts` | 5 categories, weighted pattern groups, `classifyQuery()` pure function; entity list expanded (added `page\|app\|bot\|tool\|plugin\|widget\|form\|button\|route\|handler`); pattern allows up to 3 intermediate words |
| Add types | `src/lib/types.ts` | `query_category?: string` in `MessageData`, `query_classification_enabled?: boolean` in `Settings` |
| Hook into queue processor | `src/queue-processor.ts` | After credential scrubbing, before command intercept |
| Emit event | `src/queue-processor.ts` | `emitEvent('query_classified', ...)` for visualizer |

**Acceptance**:
- `classifyQuery('/reset @coder')` → `{ category: 'command', confidence: 1.0, ... }`
- `classifyQuery('what time is it?')` → `{ category: 'question', confidence: ~0.75, ... }` _(2 patterns match: `^what` + `?$` → base 0.7 + 0.05 boost)_
- `classifyQuery('implement a login page')` → `{ category: 'code_request', confidence: 0.8, ... }` _(entity list expanded + intermediate words allowed)_
- `query_classified` event emitted with category and confidence
- INFO log `[CLASSIFY]` shows classification result

---

### Batch 4 — Processing Status Indicators (P1) [Pattern F]

**Goal**: Show progress feedback during agent processing.

**Spec source**: [ADR-011](../02-design/adr-zeroclaw-security-patterns.md)

**Scope**: Queue processor + 3 legacy channel clients

| Task | File | Detail |
|------|------|--------|
| Create processing status module | `src/lib/processing-status.ts` | `writeStatus()`, `clearStatus()`, `readStatuses()`, `formatStatusMessage()` |
| Write status in queue processor | `src/queue-processor.ts` | Write before `invokeAgent()`, clear after response |
| Add status polling to Telegram | `src/channels/telegram-client.ts` | Poll `queue/status/` in typing refresh interval, send updates every 30s |
| Add status polling to WhatsApp | `src/channels/whatsapp-client.ts` | Poll `queue/status/`, send updates |
| Add status polling to Discord | `src/channels/discord-client.ts` | Poll `queue/status/`, send updates |
| Add config flags | `src/lib/types.ts` | `processing_status_enabled?: boolean` |

**Acceptance**:
- Status file written to `queue/status/` when agent invocation starts
- Status file deleted when agent response received
- Telegram sends status message after 15s of processing
- `formatStatusMessage()` shows agent name and elapsed time (computed client-side)
- Orphaned status files (>20min) are ignored by channel clients

---

### Batch 5 — History Compaction (P2) [Pattern B]

**Goal**: Compact older conversation responses to manage context size.

**Spec source**: [ADR-012](../02-design/adr-zeroclaw-security-patterns.md)

**Scope**: Team conversations with >10 responses

| Task | File | Detail |
|------|------|--------|
| Create history compactor module | `src/lib/history-compactor.ts` | `CompactionConfig`, `compactHistory()`, extractive `extractSummary()` |
| Hook into conversation completion | `src/queue-processor.ts` | Call before response aggregation |
| Add periodic in-flight compaction | `src/queue-processor.ts` | Every 5 messages when exceeding threshold |
| Add config flag | `src/lib/types.ts` | `history_compaction_enabled?: boolean` |

**Acceptance**:
- Conversation with 12 responses → compaction triggered, `[COMPACT]` log entry
- First response always preserved intact
- Last 5 responses always preserved intact
- Middle responses compacted to `[Compacted] <first paragraph excerpt>...`
- Agent CLI conversation context (`-c` flag) unaffected

---

### Batch 6 — Build, Verify & Documentation

| Task | Detail |
|------|--------|
| TypeScript compilation | `npm run build` succeeds with zero errors |
| Integration verification | All 5 modules importable and callable |
| Documentation update | `docs/README.md` index updated with new links |
| Security audit addendum | Note new security modules in `security-audit-report.md` |

**Acceptance**:
- `npm run build` passes
- All 5 new modules follow `input-sanitizer.ts` pattern (const array + pure function + exported interface)
- `docs/README.md` lists sprint plan and ADR

---

## Estimated Impact

| Metric | Value |
|--------|-------|
| New files | 5 |
| Modified files | 7 |
| New LOC (estimated) | ~591 |
| Modified LOC (estimated) | ~80 |
| Breaking changes | 0 |
| New config flags | 5 |

---

## Batch Priority & Execution Order

```
Phase 1 (P0 Security):
  ┌─ Batch 1: Credential Scrubbing ─┐
  │                                  ├─→ Phase 2 (P1 Intelligence):
  └─ Batch 2: Environment Scrubbing ─┘     │
                                            ├─ Batch 3: Query Classification
                                            │
                                            └─→ Phase 3 (P1 UX):
                                                  │
                                                  ├─ Batch 4: Processing Status
                                                  │
                                                  └─→ Phase 4 (P2 Efficiency):
                                                        │
                                                        ├─ Batch 5: History Compaction
                                                        │
                                                        └─→ Batch 6: Build & Verify
```

Batches 1 & 2 can run in parallel (no dependencies).
Batches 3-5 are sequential (each hooks into `queue-processor.ts` at increasing depth).

---

## Review Checkpoints

| Checkpoint | Timing | Deliverable | Reviewer |
|------------|--------|-------------|----------|
| Phase 1 complete | After Batches 1+2 | Security modules pass acceptance | CTO |
| Phase 2 complete | After Batch 3 | Classification logging verified | CTO |
| Phase 3 complete | After Batch 4 | Status indicators visible on Telegram | SE4H |
| Sprint complete | After Batch 6 | `npm run build` passes, all acceptance met | CTO |

---

## Definition of Done

- [x] All 5 new modules created and follow `input-sanitizer.ts` pattern
- [x] All 7 modified files compile without errors (`npm run build` passes)
- [x] Credential scrubbing active for external messages (default: true)
- [x] Environment scrubbing active for all agent spawns (always-on)
- [x] Provider auth keys preserved (Claude/Codex still authenticate)
- [x] Query classification logging visible in INFO logs (`[CLASSIFY]`)
- [x] Processing status visible on Telegram/WhatsApp/Discord for tasks >15s
- [x] History compaction triggers for conversations >10 responses (+ periodic in-flight every 5 msgs)
- [x] Zero breaking changes (all features backward-compatible)
- [x] Documentation updated (README index ✓, ADR ✓, requirements ✓, sprint plan ✓)
- [x] `emitEvent('query_classified', ...)` for visualizer

---

## Gate Checkpoint

**Current gate**: G0.1 (Problem Validated)
**Target gate after S04**: G1 — Requirements Complete

G1 requires:
- All core requirements documented and implemented
- Security requirements validated (credential + env scrubbing)
- UX requirements met (processing feedback)
- CTO sign-off on ADR and sprint completion
