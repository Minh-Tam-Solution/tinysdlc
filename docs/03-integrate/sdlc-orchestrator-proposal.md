# TinySDLC - SDLC-Orchestrator Integration Proposal

**SDLC Version**: 6.1.0
**Stage**: 03 - INTEGRATE
**Status**: Active
**Authority**: CTO Approved
**Date**: 2026-02-16
**Audience**: SDLC-Orchestrator development team

---

## Executive Summary

TinySDLC is an async multi-agent orchestrator that runs AI agents via Telegram/Discord/WhatsApp. SDLC-Orchestrator is a governance control plane with Gate Engine, Evidence Vault, and Context Overlay.

This document proposes 4 integration points for the two systems to interoperate. TinySDLC would consume SDLC-Orchestrator services; agents would gain stage-awareness and audit trail capabilities.

**Key constraint**: TinySDLC is a **polling-based, file-queue system** with no HTTP server. Any integration must work with stateless REST calls, not WebSocket or inbound webhooks.

---

## TinySDLC Architecture (for Orchestrator team)

```
[User on Telegram]
       │
[Telegram Bot Client]
       │ writes JSON to file
[~/.tinysdlc/queue/incoming/]
       │ polls every 1s
[Queue Processor (Node.js)]
       │
       ├── routes to agent (claude CLI / codex CLI / Ollama REST)
       │
[~/.tinysdlc/queue/outgoing/]
       │ polls every 1s
[Telegram Bot Client]
       │
[User on Telegram]
```

Key characteristics:
- **No HTTP server** — pure file-based queue
- **Hot-reload** — `settings.json` re-read on every message
- **Isolated agent workspaces** — each agent has its own directory
- **Max 50 messages** per team conversation (loop prevention)
- **Providers**: Anthropic Claude CLI, OpenAI Codex CLI, Ollama REST API

---

## Integration Points (Priority Order)

### Integration 1: Context Overlay — Agent Stage Awareness (HIGH)

**TinySDLC change needed**: In `src/lib/invoke.ts`, before invoking an agent, fetch stage context from Orchestrator and write to `SYSTEM_CONTEXT.md` in agent's working directory.

**Endpoint required**:
```
GET /api/v1/context/{project_id}/agent/{sdlc_role}
```

Returns agent-role-specific context (max ~100 lines markdown). Example for `reviewer`:
```markdown
## Current Stage: 04-Build
## Sprint: S01 SDLC Support
## Your Gate: G3 Ship Ready
## Active Constraints:
- Coverage threshold: 80% (currently 67%)
- Open P1 finding: SQL injection in auth module (unresolved)
## Do NOT proceed on: deployment tasks (G3 not confirmed)
```

**Why per-role?** Generic `/context/{project_id}` returns full project context — too much noise for each agent. Agent should only see what's relevant to its stage.

**TinySDLC implementation sketch**:
```typescript
// In invokeAgent(), if sdlc config is present:
const context = await fetchOrchestratorContext(projectId, agent.sdlc_role);
fs.writeFileSync(path.join(workingDir, 'SYSTEM_CONTEXT.md'), context);
```

**Settings schema addition**:
```json
{
  "sdlc": {
    "orchestrator_url": "http://localhost:8000",
    "project_id": "uuid",
    "api_token": "jwt-or-api-key",
    "enabled": true
  }
}
```

---

### Integration 2: Evidence Capture — Audit Trail (HIGH)

**TinySDLC change needed**: After `invokeAgent()` returns, async POST the response to Evidence Vault. Must be **non-blocking** — cannot delay message delivery.

**Endpoint required**:
```
POST /api/v1/evidence/batch
Content-Type: application/json

{
  "conversation_id": "tinysdlc_conv_abc123",
  "project_id": "uuid",
  "artifacts": [
    {
      "agent_id": "coder",
      "sdlc_role": "coder",
      "artifact_type": "implementation",
      "content": "<agent response text>",
      "stage": "04-build",
      "timestamp": "2026-02-16T10:30:00Z"
    }
  ]
}
```

**Why batch?** A team conversation with `coder` + `reviewer` generates 2+ artifacts in one flow. Batch avoids N individual API calls.

**Artifact type mapping**:

| Agent Role | Artifact Type |
|-----------|---------------|
| pm | `requirement` |
| architect | `design_decision` |
| coder | `implementation` |
| reviewer | `review` |
| tester | `test_result` |
| devops | `deployment_record` |

**TinySDLC implementation sketch**:
```typescript
// After invokeAgent() — fire and forget
submitEvidenceAsync(settings.sdlc, {
    conversation_id: conversationId,
    agent_id: agentId,
    sdlc_role: agent.sdlc_role,
    content: response,
    artifact_type: roleToArtifactType(agent.sdlc_role)
}).catch(err => log('WARN', `Evidence upload failed: ${err.message}`));
```

---

### Integration 3: Gate Notifications — Push to User (MEDIUM)

**Architecture decision**: TinySDLC has NO HTTP server. Instead of an inbound webhook, TinySDLC **polls** for pending gate events.

**Endpoint required (new)**:
```
GET /api/v1/events/feed?project_id=X&since=2026-02-16T10:00:00Z&types=gate_status,evidence_required
```

Returns ordered list of events since timestamp:
```json
{
  "events": [
    {
      "id": "evt_001",
      "type": "gate_status_change",
      "gate": "G3",
      "status": "pending_approval",
      "project": "TinySDLC v0.2.0",
      "timestamp": "2026-02-16T10:30:00Z",
      "message": "G3 Ship Ready awaiting CTO approval"
    }
  ],
  "last_event_id": "evt_001"
}
```

**TinySDLC implementation sketch**: Add polling job in queue-processor.ts every 30s:
```typescript
// Poll for gate events, format as messages, write to outgoing queue
const events = await fetchGateEvents(settings.sdlc, lastEventId);
for (const event of events) {
    writeToOutgoing(formatGateNotification(event), userId);
}
```

**Telegram notification example**:
```
Gate G3: Ship Ready
Project: TinySDLC v0.2.0
Status: Awaiting CTO Approval
Validated by: reviewer + tester
Action: /approve G3  or  /reject G3 "reason"
```

---

### Integration 4: Gate Approval via Telegram (LOW)

**TinySDLC change needed**: Parse `/approve G3` and `/reject G3 "reason"` in `src/channels/telegram-client.ts`.

**Endpoint required**:
```
POST /api/v1/gates/{gate_id}/approve
Authorization: Bearer {api_token}
{
  "approved_by": "telegram_user_123",
  "comment": "optional comment"
}

POST /api/v1/gates/{gate_id}/reject
{
  "rejected_by": "telegram_user_123",
  "reason": "needs more tests"
}
```

**Auth requirement**: Gate approval must be tied to a specific user with SDLC-Orchestrator permissions. Telegram sender ID → Orchestrator user mapping is required. Suggest: add `orchestrator_user_id` to pairing record.

**Confirmation flow** (prevents accidental approvals):
```
User: /approve G3
Bot:  Confirm: Approve Gate G3 "Ship Ready" for project TinySDLC v0.2.0?
      Reply YES to confirm.
User: YES
Bot:  Gate G3 approved. Proceeding to Stage 06-Deploy.
```

---

## Corrected Time Estimates

| Integration | TinySDLC effort | Orchestrator effort | Total |
|-------------|----------------|---------------------|-------|
| Context Overlay | 6h | 4h (per-role endpoint) | 10h |
| Evidence Capture | 3h | 3h (batch endpoint) | 6h |
| Gate Notifications | 3h (polling) | 4h (event feed) | 7h |
| Gate Approval | 3h | 2h (auth + endpoints) | 5h |
| **Total** | **15h** | **13h** | **28h** |

---

## Requests from TinySDLC team to Orchestrator team

1. **New endpoint**: `GET /api/v1/context/{project_id}/agent/{role}` — role-filtered context, max 150 lines markdown
2. **New endpoint**: `POST /api/v1/evidence/batch` — batch artifact upload
3. **New endpoint**: `GET /api/v1/events/feed?project_id=X&since=T&types=...` — event stream for polling
4. **Auth**: Service-level API key (not user JWT) with scopes: `context:read`, `evidence:write`, `gates:read`, `gates:approve` (delegated)
5. **Optional**: `GET /api/v1/agents-md/generate` with `format: "tinysdlc"` — TinySDLC-optimized AGENTS.md output

---

## What TinySDLC will NOT implement

- **Inbound webhooks**: No HTTP server. Polling is the pattern.
- **WebSocket**: TinySDLC uses 1s polling, not real-time connections.
- **MCP integration**: SDLC-Orchestrator MCP targets IDE (Cursor/Claude Code), not async queue model.
- **Full AGENTS.md replacement**: TinySDLC's role template + dynamic teammate roster is sufficient.
- **Automatic gate approval**: Always requires human SE4H confirmation.

---

## Open Questions for Orchestrator Team

1. Does `/api/v1/context/{project_id}` already support per-role filtering, or is a new endpoint needed?
2. Does Evidence Vault support bulk uploads? What's the `artifact_type` enum?
3. Is there an event/notification feed API, or is outbound webhook the only option?
4. What auth method is preferred for service accounts (API key vs OAuth2 client credentials)?
5. What's the format of `gate_id` — UUID, or human-readable like `G3`?

---

## Contact

TinySDLC repository: `github.com/Minh-Tam-Solution/tinysdlc`
SDLC-Orchestrator repository: `github.com/[org]/SDLC-Orchestrator`
