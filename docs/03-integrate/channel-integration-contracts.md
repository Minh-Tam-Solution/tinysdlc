# TinySDLC - Channel Integration Contracts

**SDLC Version**: 6.1.0
**Stage**: 03 - INTEGRATE
**Status**: Active
**Authority**: CTO Approved

---

## External Integrations

### Discord (discord.js v14)
- **Type**: Bot application via Discord.js
- **Auth**: Bot token (`DISCORD_BOT_TOKEN`)
- **Message flow**: DM listener -> queue/incoming -> queue/outgoing -> DM reply
- **File support**: Attachments (photos, documents, audio, video)
- **Char limit**: 2000 per message (auto-split for longer responses)

### Telegram (node-telegram-bot-api v0.67)
- **Type**: Bot via Telegram Bot API (polling)
- **Auth**: Bot token (`TELEGRAM_BOT_TOKEN`)
- **Message flow**: Polling-based listener -> queue/incoming -> queue/outgoing -> reply
- **File support**: Photos, documents, audio, voice, video, stickers
- **Bot commands**: Registered on startup (`/agent`, `/team`, `/reset`)
- **Char limit**: 4096 per message (auto-split)

### WhatsApp (whatsapp-web.js v1.34)
- **Type**: Web client via Puppeteer
- **Auth**: QR code pairing
- **Message flow**: Message listener -> queue/incoming -> queue/outgoing -> MessageMedia reply
- **File support**: All media types via MessageMedia
- **Plugin**: `src/channels/plugins/whatsapp.ts`

### Zalo OA (Zalo Bot Platform API)
- **Type**: OA bot via Zalo Bot Platform API (HTTP long-polling)
- **Auth**: Bot token stored in `settings.json` at `channels.zalo.token` (format: `app_id:secret_key`). No environment variable — configured via `tinysdlc setup` or direct JSON edit.
- **API base URL**: `https://bot-api.zapps.me/bot{token}/{method}` (token embedded in path, no separator slash between "bot" and token value)
- **Message flow**: Long-polling `getUpdates` → `writeMessageToIncoming()` → `queue/incoming/` → queue-processor → `queue/outgoing/` → `deliverPluginResponses()` → `sendMessage`
- **Long-poll behavior**: Server holds the connection for `timeout` seconds (default 30s), returns HTTP 408 on timeout (no new messages). This is normal — plugin reconnects immediately.
- **Actual API response format** (single object, not array):
  ```json
  {
    "ok": true,
    "result": {
      "message": {
        "msg_id": "...",
        "text": "Hi @assistant",
        "from_id": "6c4c467767348e6ad725",
        "to_id": "...",
        "timestamp": 1740000000000
      },
      "event_name": "message.text.received",
      "from": {
        "id": "6c4c467767348e6ad725",
        "display_name": "Đặng Thế Tài"
      }
    }
  }
  ```
- **Char limit**: 2000 per message (auto-split)
- **File support**: Text only (Phase 1). Image/document send via `send_file:` tag is not yet implemented for Zalo OA.
- **Plugin**: `src/channels/plugins/zalo.ts`
- **Orchestrator mapping**: `zalo` → `zalo` (ChannelType)
- **Queue bridge**: Plugin messages are bridged via `writeMessageToIncoming()` and `deliverPluginResponses()` in `queue-processor.ts` — see [Queue System Design](../02-design/queue-system-design.md)

### Zalo Personal (zca-cli)
- **Type**: Personal account via zca-cli child process wrapper
- **Auth**: zca-cli login session
- **Message flow**: JSON line streaming -> queue/incoming -> queue/outgoing -> zca-cli send
- **Auto-restart**: Exponential backoff on process crash
- **Plugin**: `src/channels/plugins/zalouser.ts`
- **Orchestrator mapping**: `zalouser` → `zalo` (ChannelType — both Zalo variants map to `zalo`)

---

## AI Providers

### Anthropic (Claude Code CLI)
- **CLI**: `claude --dangerously-skip-permissions -c -p <message>`
- **Models**: `opus` (deep reasoning), `sonnet` (fast execution)
- **SDLC roles**: researcher (opus), architect (opus), pjm (sonnet), coder (sonnet), tester (sonnet), devops (sonnet)
- **Auth**: `ANTHROPIC_API_KEY` env var or Claude CLI login

### OpenAI (Codex CLI)
- **CLI**: `codex exec ... --dangerously-bypass-approvals-and-sandbox --json`
- **Models**: `gpt-5.2`
- **SDLC roles**: pm (gpt-5.2), reviewer (gpt-5.2)
- **Auth**: `OPENAI_API_KEY` env var (loaded via dotenv from `.env`)

### Ollama (Local/Company-hosted)
- **API**: HTTP POST to `/api/chat` endpoint
- **Models**: `qwen2.5-coder:32b` (default), any Ollama-hosted model
- **URL**: Configurable via `settings.providers.ollama.url` or `OLLAMA_URL` env var
- **Company infra**: `https://api.nhatquangholding.com`
- **Stateless**: No conversation memory between invocations

---

## ChannelPlugin Architecture (CTO-2026-002)

All channels implement the `ChannelPlugin` interface:

```typescript
interface ChannelPlugin {
  id: string;
  name: string;
  capabilities: {
    threading: boolean;
    reactions: boolean;
    fileAttachments: boolean;
    maxMessageLength: number;
  };
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(channelId: string, message: string, options?: SendOptions): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => void): void;
}
```

**Plugin loader** (`src/channels/plugin-loader.ts`):
- `register(plugin)` — register a channel plugin
- `get(id)` — get plugin by channel ID
- `getAll()` — list all registered plugins
- `connectEnabled()` — connect all enabled channels from settings
- `disconnectAll()` — graceful shutdown

**Adding a new channel**: Implement `ChannelPlugin`, register in plugin loader, add channel ID to settings — zero core changes needed.

---

## Integration Pattern

All channel clients follow the same pattern (via ChannelPlugin or legacy `src/channels/`):
1. Listen for messages -> apply sender pairing check -> write JSON to `queue/incoming/`
2. Poll `queue/outgoing/` every 1s -> deliver responses (split long messages, file attachments)
3. Long responses (>4000 chars) saved as `.md` files and sent as attachments
4. Input sanitization: 12 prompt injection patterns stripped from OTT input before agent context injection
