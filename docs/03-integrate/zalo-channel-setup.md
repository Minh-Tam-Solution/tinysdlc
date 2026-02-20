# TinySDLC - Zalo Channel Setup Guide

**SDLC Version**: 6.1.0
**Stage**: 03 - INTEGRATE
**Status**: Active
**Authority**: CTO Approved

---

## Overview

TinySDLC supports two Zalo channels:

| Channel | Plugin ID | API | Auth Method | Use Case |
|---------|-----------|-----|-------------|----------|
| **Zalo OA** | `zalo` | Bot Platform API (HTTP) | Token (`app_id:secret_key`) | Official Account bots |
| **Zalo Personal** | `zalouser` | Zalo Bot Manager (recommended) or zca-cli | Token or QR code | Personal account bots |

Both channels support **text messages only** (Phase 1) and **DM/1:1 conversations only**.

---

## Zalo OA (Official Account)

### Prerequisites

1. A Zalo Official Account registered at [oa.zalo.me](https://oa.zalo.me)
2. Bot Platform API token in `app_id:secret_key` format

### Configuration

Add to your `settings.json`:

```json
{
  "channels": {
    "zalo": {
      "enabled": true,
      "token": "YOUR_APP_ID:YOUR_SECRET_KEY"
    }
  }
}
```

### Optional: Custom API Base URL

If the default Bot Platform endpoint (`https://bot-api.zapps.me/bot`) is unavailable in your region, you can specify an alternative:

```json
{
  "channels": {
    "zalo": {
      "enabled": true,
      "token": "YOUR_APP_ID:YOUR_SECRET_KEY",
      "apiBaseUrl": "https://bot-api.zaloplatforms.com/bot"
    }
  }
}
```

### How It Works

- Uses **HTTP long-polling** (30s timeout) to receive messages
- Sends messages via POST to Bot Platform API
- Messages are chunked at **2000 characters** with 500ms delay between chunks
- Exponential backoff on errors (1s to 5 min)
- 1:1 messaging only (Zalo OA does not support group chats)

---

## Zalo Personal

Two setup options are available. **Zalo Bot Manager** is recommended for simplicity; **zca-cli** is available for advanced users who need direct API access.

### Option A: Zalo Bot Manager (Recommended)

No binary to install, no QR code — just a web dashboard and a token.

#### Setup

1. Go to [Zalo Bot Manager](https://bot.zaloplatforms.com) and sign in with your Zalo account
2. Create a new bot and configure its settings
3. Copy the bot token (format: `12345689:abc-xyz`)

#### Configuration

Add to your `settings.json`:

```json
{
  "channels": {
    "zalouser": {
      "enabled": true,
      "token": "12345689:abc-xyz"
    }
  }
}
```

Or set via environment variable: `ZALO_BOT_TOKEN=12345689:abc-xyz`

**Free tier limits**: Up to 3 bots, 50 users per bot, 3,000 messages/month.

### Option B: zca-cli (Advanced)

For users who need direct access to the Zalo Personal API without going through the Bot Platform.

#### Prerequisites

1. Install `zca-cli`:

   ```bash
   # macOS / Linux
   curl -fsSL https://get.zca-cli.dev/install.sh | bash

   # Verify installation
   zca --version
   ```

2. Authenticate (QR code):

   ```bash
   zca auth login
   ```

   Scan the QR code with your Zalo mobile app.

#### Configuration

Add to your `settings.json`:

```json
{
  "channels": {
    "zalouser": {
      "enabled": true
    }
  }
}
```

#### Optional: Custom Binary Path and Profile

```json
{
  "channels": {
    "zalouser": {
      "enabled": true,
      "zcaPath": "/usr/local/bin/zca",
      "profile": "work"
    }
  }
}
```

#### Multi-Account Support (zca-cli only)

Use the `profile` field to specify which zca profile to use. Manage profiles with:

```bash
zca account list        # List profiles
zca account switch work # Switch active profile
```

### How It Works

- **Bot Manager mode**: Long-polling via Zalo Bot Platform API
- **zca-cli mode**: Spawns `zca listen -r -k` as a child process, reads JSON lines from stdout
- Filters for text messages (`type: 1`) in DM conversations (`threadType: 1`)
- Auto-restarts on process exit (exponential backoff: 5s to 5 min)
- Messages chunked at **2000 characters**

---

## Troubleshooting

### Zalo OA

| Issue | Cause | Fix |
|-------|-------|-----|
| `token must be in "app_id:secret_key" format` | Token missing `:` separator | Check token format from Bot Platform dashboard |
| `HTTP 401` on connect | Invalid token | Regenerate token from OA dashboard |
| Messages not received | Polling interrupted | Check logs for backoff errors; restart TinySDLC |

### Zalo Personal (Bot Manager)

| Issue | Cause | Fix |
|-------|-------|-----|
| `HTTP 401` on connect | Invalid or expired token | Regenerate token at [bot.zaloplatforms.com](https://bot.zaloplatforms.com) |
| Messages not received | Bot not active | Check bot status in Bot Manager dashboard |
| Rate limit errors | Exceeded free tier (3,000 msgs/month) | Upgrade plan or wait for reset |

### Zalo Personal (zca-cli)

| Issue | Cause | Fix |
|-------|-------|-----|
| `zca: command not found` | zca-cli not installed or not in PATH | Install zca-cli or set `zcaPath` in config |
| `zca listener exited` | Session expired | Run `zca auth login` to re-authenticate |
| No messages received | Wrong profile or not authenticated | Run `zca account current` to verify active profile |
| `zca send failed` | Session issue or rate limit | Check `zca auth cache-refresh` |

---

## Limitations (Phase 1)

- Text messages only (no images, files, stickers)
- DM/1:1 only (no group messages)
- Zalo OA: Polling mode only (webhook not yet implemented)
- Zalo Personal: Single profile per instance
- Zalo Personal: Display names not available (sender ID used)
