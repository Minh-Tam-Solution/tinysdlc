# TinySDLC - Channel Integration Contracts

**SDLC Version**: 6.0.6
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

### AI Providers
- **Anthropic**: Claude Code CLI (`claude --dangerously-skip-permissions`)
- **OpenAI**: Codex CLI (`codex exec ... --dangerously-bypass-approvals-and-sandbox`)
- **Per-agent configuration**: Provider and model selectable per agent via `tinysdlc agent provider`

## Integration Pattern

All channel clients follow the same pattern (see `src/channels/`):
1. Listen for messages -> apply sender pairing check -> write JSON to `queue/incoming/`
2. Poll `queue/outgoing/` every 1s -> deliver responses (split long messages, file attachments)
3. Long responses (>4000 chars) saved as `.md` files and sent as attachments
