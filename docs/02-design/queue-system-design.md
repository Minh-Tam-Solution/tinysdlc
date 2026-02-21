# TinySDLC - Queue System Design

**SDLC Version**: 6.1.0
**Stage**: 02 - DESIGN
**Status**: Active
**Authority**: CTO Approved

---

<!-- Originally: docs/QUEUE.md -->

TinySDLC uses a file-based queue system to coordinate message processing across multiple channels and agents. This document explains how it works.

## Overview

The queue system acts as a central coordinator between:
- **Channel clients** (Discord, Telegram, WhatsApp) - produce messages
- **Queue processor** - routes and processes messages
- **AI providers** (Claude, Codex) - generate responses
- **Agents** - isolated AI agents with different configs

```
┌─────────────────────────────────────────────────────────────┐
│               Legacy Channel Clients                        │
│         (Discord, Telegram, WhatsApp, Heartbeat)            │
│         src/channels/{discord,telegram,whatsapp}-client.ts  │
└────────────────────┬────────────────────────────────────────┘
                     │ Write message.json directly
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              ChannelPlugin Bridge (S03 upgrade)              │
│      (Zalo OA, Zalo Personal — src/channels/plugins/)       │
│                                                              │
│  plugin.onMessage() ──→ writeMessageToIncoming()            │
│                                                              │
│  deliverPluginResponses() ←── poll queue/outgoing/          │
│       ↓                                                      │
│  plugin.sendMessage(chatId, text)                            │
└────────┬───────────────────────────────────────────────────┘
         │ Write / Read message.json
         ↓
┌─────────────────────────────────────────────────────────────┐
│                   ~/.tinysdlc/queue/                         │
│                                                              │
│  incoming/          processing/         outgoing/           │
│  ├─ msg1.json  →   ├─ msg1.json   →   ├─ msg1.json        │
│  ├─ msg2.json       └─ msg2.json       └─ msg2.json        │
│  └─ msg3.json                                                │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │ Queue Processor
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Parallel Processing by Agent                    │
│                                                              │
│  Agent: coder        Agent: writer       Agent: assistant   │
│  ┌──────────┐       ┌──────────┐        ┌──────────┐       │
│  │ Message 1│       │ Message 1│        │ Message 1│       │
│  │ Message 2│ ...   │ Message 2│  ...   │ Message 2│ ...   │
│  │ Message 3│       │          │        │          │       │
│  └────┬─────┘       └────┬─────┘        └────┬─────┘       │
│       │                  │                     │            │
└───────┼──────────────────┼─────────────────────┼────────────┘
        ↓                  ↓                     ↓
   claude CLI         claude CLI             claude CLI
  (workspace/coder)  (workspace/writer)  (workspace/assistant)
```

## Directory Structure

```
~/.tinysdlc/
├── queue/
│   ├── incoming/          # New messages from channels
│   │   ├── msg_123456.json
│   │   └── msg_789012.json
│   ├── processing/        # Currently being processed
│   │   └── msg_123456.json
│   └── outgoing/          # Responses ready to send
│       └── msg_123456.json
├── logs/
│   ├── queue.log         # Queue processor logs
│   ├── discord.log       # Channel-specific logs
│   └── telegram.log
└── files/                # Uploaded files from channels
    └── image_123.png
```

## Message Flow

### 1. Incoming Message

A channel client receives a message and writes it to `incoming/`:

```json
{
  "channel": "discord",
  "sender": "Alice",
  "senderId": "user_12345",
  "message": "@coder fix the authentication bug",
  "timestamp": 1707739200000,
  "messageId": "discord_msg_123",
  "files": ["/path/to/screenshot.png"]
}
```

**Optional fields:**
- `agent` - Pre-route to specific agent (bypasses @agent_id parsing)
- `files` - Array of file paths uploaded with message

### 2. Processing

The queue processor (runs every 1 second):

1. **Scans `incoming/`** for new messages
2. **Sorts by timestamp** (oldest first)
3. **Determines target agent**:
   - Checks `agent` field (if pre-routed)
   - Parses `@agent_id` prefix from message
   - Falls back to `default` agent
4. **Moves to `processing/`** (atomic operation)
5. **Routes to agent's promise chain** (parallel processing)

### 3. Agent Processing

Each agent has its own promise chain:

```typescript
// Messages to same agent = sequential (preserve conversation order)
agentChain: msg1 → msg2 → msg3

// Different agents = parallel (don't block each other)
@coder:     msg1 ──┐
@writer:    msg1 ──┼─→ All run concurrently
@assistant: msg1 ──┘
```

**Per-agent isolation:**
- Each agent runs in its own `working_directory`
- Separate conversation history (managed by CLI)
- Independent reset flags
- Own configuration files (.claude/, AGENTS.md)

### 4. AI Provider Execution

**Claude (Anthropic):**
```bash
cd ~/workspace/coder/
claude --dangerously-skip-permissions \
  --model claude-sonnet-4-5 \
  -c \  # Continue conversation
  -p "fix the authentication bug"
```

**Codex (OpenAI):**
```bash
cd ~/workspace/coder/
codex exec resume --last \
  --model gpt-5.3-codex \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  --json "fix the authentication bug"
```

### 5. Response

After AI responds, queue processor writes to `outgoing/`:

```json
{
  "channel": "discord",
  "sender": "Alice",
  "message": "I've identified the issue in auth.ts:42...",
  "originalMessage": "@coder fix the authentication bug",
  "timestamp": 1707739205000,
  "messageId": "discord_msg_123",
  "agent": "coder",
  "files": ["/path/to/fix.patch"]
}
```

### 6. Channel Delivery

Channel clients poll `outgoing/` and:
1. Read response for their channel
2. Send message to user
3. Delete the JSON file
4. Handle any file attachments

## Parallel Processing

### How It Works

Each agent has its own **promise chain** that processes messages sequentially:

```typescript
const agentProcessingChains = new Map<string, Promise<void>>();

// When message arrives for @coder:
const chain = agentProcessingChains.get('coder') || Promise.resolve();
const newChain = chain.then(() => processMessage(msg));
agentProcessingChains.set('coder', newChain);
```

### Benefits

**Example: 3 messages sent simultaneously**

Sequential (old):
```
@coder fix bug 1     [████████████████] 30s
@writer docs         [██████████] 20s
@assistant help      [████████] 15s
Total: 65 seconds
```

Parallel (new):
```
@coder fix bug 1     [████████████████] 30s
@writer docs         [██████████] 20s ← concurrent!
@assistant help      [████████] 15s   ← concurrent!
Total: 30 seconds (2.2x faster!)
```

### Conversation Order Preserved

Messages to the **same agent** remain sequential:

```
@coder fix bug 1     [████] 10s
@coder fix bug 2             [████] 10s  ← waits for bug 1
@writer docs         [██████] 15s        ← parallel with both
```

This ensures:
- ✅ Conversation context is maintained
- ✅ `-c` (continue) flag works correctly
- ✅ No race conditions within an agent
- ✅ Agents don't block each other

## Agent Routing

### Explicit Routing

Use `@agent_id` prefix:

```
User: @coder fix the login bug
→ Routes to agent "coder"
→ Message becomes: "fix the login bug"
```

### Pre-routing

Channel clients can pre-route:

```typescript
const queueData = {
  channel: 'discord',
  message: 'help me',
  agent: 'assistant'  // Pre-routed, no @prefix needed
};
```

### Fallback Logic

```
1. Check message.agent field (if pre-routed)
2. Parse @agent_id from message text
3. Look up agent in settings.agents
4. Fall back to 'default' agent
5. If no default, use first available agent
```

### Routing Examples

```
"@coder fix bug"           → agent: coder
"help me"                  → agent: default
"@unknown test"            → agent: default (unknown agent)
"@assistant help"          → agent: assistant
pre-routed with agent=X    → agent: X
```

### Easter Egg: Multiple Agents 🥚

If you mention multiple agents in one message:

```
User: "@coder @writer fix this bug and document it"

Result:
  → Returns friendly message about upcoming agent-to-agent collaboration
  → No AI processing (saves tokens!)
  → Suggests sending separate messages to each agent
```

**The easter egg message:**
> 🚀 **Agent-to-Agent Collaboration - Coming Soon!**
>
> You mentioned multiple agents: @coder, @writer
>
> Right now, I can only route to one agent at a time. But we're working on something cool:
>
> ✨ **Multi-Agent Coordination** - Agents will be able to collaborate on complex tasks!
> ✨ **Smart Routing** - Send instructions to multiple agents at once!
> ✨ **Agent Handoffs** - One agent can delegate to another!
>
> For now, please send separate messages to each agent:
> • `@coder [your message]`
> • `@writer [your message]`
>
> _Stay tuned for updates! 🎉_

This prevents confusion and teases the upcoming feature!

## Reset System

### Per-Agent Reset

Creates `<workspace>/<agent_id>/reset_flag`:

```bash
tinysdlc reset coder
tinysdlc reset coder researcher    # reset multiple agents
tinysdlc agent reset coder
# Or in chat:
/reset @coder
/reset @coder @researcher
```

Next message to **that agent** starts fresh.

### How Resets Work

Queue processor checks before each message:

```typescript
const agentReset = fs.existsSync(`${agentDir}/reset_flag`);

if (agentReset) {
  // Don't pass -c flag to CLI
  // Delete flag file
}
```

## File Handling

### Uploading Files

Channels download files to `~/.tinysdlc/files/`:

```
User uploads: image.png
→ Saved as: ~/.tinysdlc/files/telegram_123_image.png
→ Message includes: [file: /absolute/path/to/image.png]
```

### Sending Files

AI can send files back:

```
AI response: "Here's the diagram [send_file: /path/to/diagram.png]"
→ Queue processor extracts file path
→ Adds to response.files array
→ Channel client sends as attachment
→ Tag is stripped from message text
```

## Error Handling

### Missing Agents

If agent not found:
```
User: @unknown help
→ Routes to: default agent
→ Logs: WARNING - Agent 'unknown' not found, using 'default'
```

### Processing Errors

Errors are caught per-agent:

```typescript
newChain.catch(error => {
  log('ERROR', `Error processing message for agent ${agentId}: ${error.message}`);
});
```

Failed messages:
- Don't block other agents
- Are logged to `queue.log`
- Response file not created
- Channel client times out gracefully

### Stale Messages

Orphaned files in `processing/` (from crash mid-process):
- On startup, `recoverOrphanedFiles()` moves them back to `incoming/` via `fs.renameSync`
- They are then re-processed from scratch on the next poll cycle

## Performance

### Throughput

- **Sequential**: 1 message per AI response time (~10-30s)
- **Parallel**: N agents × 1 message per response time
- **3 agents**: ~3x throughput improvement

### Latency

- Queue check: Every 1 second
- Agent routing: <1ms (file peek)
- Max latency: 1s + AI response time

### Scaling

**Good for:**
- ✅ Multiple independent agents
- ✅ High message volume
- ✅ Long AI response times

**Limitations:**
- ⚠️ File-based (not database)
- ⚠️ Single queue processor instance
- ⚠️ All agents on same machine

## Debugging

### Check Queue Status

```bash
# See pending messages
ls ~/.tinysdlc/queue/incoming/

# See processing
ls ~/.tinysdlc/queue/processing/

# See responses waiting
ls ~/.tinysdlc/queue/outgoing/

# Watch queue logs
tail -f ~/.tinysdlc/logs/queue.log
```

### Common Issues

**Messages stuck in incoming:**
- Queue processor not running
- Check: `tinysdlc status`

**Messages stuck in processing:**
- AI CLI crashed or hung
- Manual cleanup: `rm ~/.tinysdlc/queue/processing/*`
- Restart: `tinysdlc restart`

**No responses generated:**
- Check agent routing (wrong @agent_id?)
- Check AI CLI is installed (claude/codex)
- Check logs: `tail -f ~/.tinysdlc/logs/queue.log`

**Agents not processing in parallel:**
- Check TypeScript build: `npm run build`
- Check queue processor version in logs

## Advanced Topics

### Custom Queue Implementations

Replace file-based queue with:
- Redis (for multi-instance)
- Database (for persistence)
- Message broker (RabbitMQ, Kafka)

Key interface to maintain:
```typescript
interface QueueMessage {
  channel: string;
  sender: string;
  message: string;
  timestamp: number;
  messageId: string;
  agent?: string;
  files?: string[];
}
```

### Load Balancing

Currently: All agents run on same machine

Future: Route agents to different machines:
```json
{
  "agents": {
    "coder": {
      "host": "worker1.local",
      "working_directory": "/agents/coder"
    },
    "writer": {
      "host": "worker2.local",
      "working_directory": "/agents/writer"
    }
  }
}
```

### Monitoring

Add metrics:
```typescript
- messages_processed_total (by agent)
- processing_duration_seconds (by agent)
- queue_depth (incoming/processing/outgoing)
- agent_active_processing (concurrent count)
```

## ChannelPlugin Bridge

New channels (Zalo OA, Zalo Personal) use the `ChannelPlugin` interface instead of writing to the file queue directly. The queue-processor bridges them:

### Inbound (plugin → queue)

```typescript
// queue-processor.ts — called from initPlugins()
function writeMessageToIncoming(msg: IncomingChannelMessage): void {
    if (!msg.chatId?.trim()) return;  // guard: drop if no chatId
    const messageId = crypto.randomUUID();
    const messageData: MessageData = {
        channel: msg.channelId,
        sender: msg.senderName || msg.senderId || 'unknown',
        senderId: msg.chatId.trim(),
        message: msg.content || '',
        timestamp: msg.timestamp || Date.now(),
        messageId,
    };
    const filename = `${msg.channelId}_${messageData.timestamp}_${messageId}.json`;
    fs.writeFileSync(path.join(QUEUE_INCOMING, filename), JSON.stringify(messageData, null, 2));
}
```

`initPlugins()` registers each enabled plugin's `onMessage(writeMessageToIncoming)` handler. Once registered, the plugin's long-poll loop fires `writeMessageToIncoming` for every received message.

### Outbound (queue → plugin)

```typescript
// queue-processor.ts — runs every 1s via setInterval
async function deliverPluginResponses(): Promise<void> {
    if (pluginShutdown || pluginDelivering) return;
    pluginDelivering = true;
    // For each file in queue/outgoing/:
    //   if plugin.id matches file.channel:
    //     await plugin.sendMessage(chatId, message)
    //     fs.unlinkSync(file)   ← delete only after successful send
    pluginDelivering = false;
}
```

Files are kept on disk if `sendMessage` throws — they will be retried on the next 1s tick.

### Startup Sequence

```
queue-processor.ts main():
  1. initPlugins()              ← instantiate + register plugins
  2. pluginLoader.connectEnabled()  ← start long-poll loops
  3. setInterval(processQueue, 1000)    ← existing queue loop
  4. setInterval(deliverPluginResponses, 1000)  ← new delivery loop
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
    pluginShutdown = true;
    clearInterval(processQueueTimer);
    clearInterval(deliverPluginTimer);
    await pluginLoader.disconnectAll();
    process.exit(0);
});
```

### Operational Notes

- **Queue backlog**: Heartbeat messages accumulate in `queue/incoming/` when the daemon is stopped. On restart, avoid processing large backlogs — clear stale heartbeat files first to prevent event loop saturation.
- **Event loop health**: If `setInterval` callbacks stop firing while the process is still running at high CPU, the event loop is blocked. Symptoms: log stops updating, zombie child processes. Fix: clear queue, restart daemon.
- **Long-poll 408**: Zalo OA API returns HTTP 408 when `getUpdates` times out with no messages. This is expected behavior — the plugin reconnects immediately. Do not treat 408 as an error.

---

## Cross-Team Routing (v1.1.0)

In v1.0.0, `[@agent: msg]` tags only resolve within the current team. In v1.1.0, agents can mention any agent or team across team boundaries.

### Mention Resolution Order

```
[@target: message] in agent response
  ↓
resolveTarget(target, currentAgent, currentTeam, teams, agents)
  1. Same-team agent?  → target (fast path, same as v1.0.0)
  2. Cross-team agent? → target (agent exists but in different team)
  3. Team ID?          → teams[target].leader_agent
  4. Not found         → null (mention silently dropped)
```

### Cross-Team Flow

```
User → @dev "implement login + update requirements"
  ↓
coder (team: dev) implements, responds:
  "Done. [@pm: please update requirements doc for login feature]"
  ↓
resolveTarget("pm") → pm exists, not in dev team → cross-team allowed
  ↓
enqueueInternalMessage(conv.id, "coder", "pm", message, data)
  ↓                                            [CROSS-TEAM] coder (dev) → pm (planning)
pm (team: planning) processes, responds:
  "Requirements updated."
  ↓
conv.pending-- → 0 → completeConversation()
  ↓
Aggregated response delivered to user
```

### Safety Guards

- **Circular detection**: `Conversation.agentsInChain` (Set) tracks all agents who participated. If target already in set → blocked.
- **Delegation depth**: `max_delegation_depth` (default 5) applies across all teams.
- **Conversation cap**: 50-message limit applies to entire conversation including cross-team branches.
- **Self-mention**: Agent cannot mention itself.

### Design Decision: Single Conversation

Cross-team messages stay in the **same conversation** — they do not spawn sub-conversations. The `teamContext` remains the originating team for the lifetime of the conversation. This keeps response aggregation simple: all branches (same-team and cross-team) converge into one `completeConversation()` call.

See [ADR-014](adr-zeroclaw-security-patterns.md) for full rationale.

---

## See Also

- [Agent Architecture](agent-architecture.md) - Agent configuration and management
- [Channel Integration Contracts](../03-integrate/channel-integration-contracts.md) - Per-channel API details
- [ADR-014: Cross-Team Routing](adr-zeroclaw-security-patterns.md) - Architecture decision
- [README.md](../README.md) - Main project documentation
- [src/queue-processor.ts](../src/queue-processor.ts) - Implementation
- [src/channels/plugins/](../src/channels/plugins/) - ChannelPlugin implementations
