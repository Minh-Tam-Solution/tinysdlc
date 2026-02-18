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
| **Zalo Personal** | `zalouser` | zca-cli (subprocess) | QR code via `zca auth login` | Personal account automation |

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

### Prerequisites

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

### Configuration

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

### Optional: Custom Binary Path and Profile

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

### How It Works

- Spawns `zca listen -r -k` as a child process
- Reads JSON lines from stdout (one message per line)
- Filters for text messages (`type: 1`) in DM conversations (`threadType: 1`)
- Sends via `zca msg send <threadId> <content>`
- Auto-restarts listener on process exit (exponential backoff: 5s to 5 min)
- Messages chunked at **2000 characters**

### Multi-Account Support

Use the `profile` field to specify which zca profile to use. Manage profiles with:

```bash
zca account list        # List profiles
zca account switch work # Switch active profile
```

---

## Troubleshooting

### Zalo OA

| Issue | Cause | Fix |
|-------|-------|-----|
| `token must be in "app_id:secret_key" format` | Token missing `:` separator | Check token format from Bot Platform dashboard |
| `HTTP 401` on connect | Invalid token | Regenerate token from OA dashboard |
| Messages not received | Polling interrupted | Check logs for backoff errors; restart TinySDLC |

### Zalo Personal

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
