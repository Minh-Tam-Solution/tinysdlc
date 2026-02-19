/**
 * Zalo OA (Official Account) Channel Plugin
 *
 * Implements ChannelPlugin interface for Zalo Bot Platform API.
 * Uses HTTP long-polling with POST requests. Zero external dependencies.
 *
 * Reference: PicoClaw pkg/channels/zalo.go, OpenClaw extensions/zalo/
 *
 * API: https://bot-api.zapps.me/bot{token}/
 * Token format: "app_id:secret_key"
 * All methods are POST with JSON body.
 * Response envelope: { ok, result } or { error, message, data }
 */

import https from 'https';
import http from 'http';
import { ChannelPlugin, IncomingChannelMessage, SendMessageOptions } from '../../lib/channel-plugin';

const DEFAULT_API_BASE = 'https://bot-api.zapps.me/bot';
const POLL_TIMEOUT = 30;          // seconds
const HTTP_TIMEOUT = 35_000;      // ms (slightly > poll timeout)
const MAX_MSG_LENGTH = 2000;
const CHUNK_DELAY_MS = 500;       // rate limit courtesy between chunks
const MIN_BACKOFF = 1_000;        // 1s
const MAX_BACKOFF = 5 * 60_000;   // 5 min

/** API response envelope — standard format */
interface ApiResponseStandard<T> {
    ok: boolean;
    result: T;
    error_code?: number;
    description?: string;
}

/** API response envelope — alternative format */
interface ApiResponseAlt<T> {
    error: number;
    message: string;
    data: T;
}

interface ZaloUpdate {
    update_id?: number;
    event?: string;       // Some API versions use "event"
    event_name?: string;  // Actual Zalo Bot API uses "event_name"
    message?: {
        text?: string;
        message_id?: string;
        date?: number;
        from?: { id: string; display_name?: string };
        chat?: { id: string };
    };
}

function splitMessage(text: string, maxLength = MAX_MSG_LENGTH): string[] {
    if (text.length <= maxLength) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) { chunks.push(remaining); break; }
        let splitIndex = remaining.lastIndexOf('\n', maxLength);
        if (splitIndex <= 0) splitIndex = remaining.lastIndexOf(' ', maxLength);
        if (splitIndex <= 0) splitIndex = maxLength;
        chunks.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).replace(/^\n/, '');
    }
    return chunks;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface ZaloPluginConfig {
    token: string;           // Format: "app_id:secret_key"
    filesDir: string;
    apiBaseUrl?: string;     // Default: 'https://bot-api.zapps.me/bot' (OBS-2)
}

export class ZaloPlugin implements ChannelPlugin {
    id = 'zalo';
    meta = { name: 'Zalo OA', icon: '💬', version: '1.0.0' };
    capabilities = {
        threading: false,
        reactions: false,
        fileAttachments: false,
        maxMessageLength: MAX_MSG_LENGTH,
    };

    private running = false;
    private abortController: AbortController | null = null;
    private pollOffset = 0;
    private messageHandler: ((msg: IncomingChannelMessage) => void) | null = null;
    private readyHandler: (() => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private config: ZaloPluginConfig;
    private apiBase: string;

    constructor(config: ZaloPluginConfig) {
        this.config = config;
        const base = config.apiBaseUrl || DEFAULT_API_BASE;
        this.apiBase = `${base}${config.token}`;
    }

    async connect(): Promise<void> {
        // Validate token format: must contain ':'
        if (!this.config.token.includes(':')) {
            throw new Error('Zalo OA token must be in "app_id:secret_key" format');
        }

        // Verify credentials
        await this.callApi<{ id: string }>('getMe', {});

        this.running = true;

        // Fire ready handler
        if (this.readyHandler) this.readyHandler();

        // Start polling loop (non-blocking)
        this.pollLoop();
    }

    async disconnect(): Promise<void> {
        this.running = false;
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    async sendMessage(chatId: string, content: string, _opts?: SendMessageOptions): Promise<void> {
        if (!this.running) throw new Error('Zalo OA plugin not connected');

        const chunks = splitMessage(content);
        for (let i = 0; i < chunks.length; i++) {
            await this.callApi('sendMessage', { chat_id: chatId, text: chunks[i] });
            if (i < chunks.length - 1) {
                await sleep(CHUNK_DELAY_MS);
            }
        }
    }

    onMessage(handler: (msg: IncomingChannelMessage) => void): void {
        this.messageHandler = handler;
    }

    onReady(handler: () => void): void {
        this.readyHandler = handler;
    }

    onError(handler: (error: Error) => void): void {
        this.errorHandler = handler;
    }

    // --- Private ---

    private async pollLoop(): Promise<void> {
        let backoff = MIN_BACKOFF;

        while (this.running) {
            try {
                const payload: Record<string, number> = { timeout: POLL_TIMEOUT };
                if (this.pollOffset > 0) {
                    payload.offset = this.pollOffset;
                }

                const raw = await this.callApi<ZaloUpdate | ZaloUpdate[]>('getUpdates', payload);

                // Reset backoff on success
                backoff = MIN_BACKOFF;

                // API may return a single update object or an array
                const updates = Array.isArray(raw) ? raw : (raw ? [raw] : []);
                for (const update of updates) {
                    this.processUpdate(update);
                }
            } catch (err: unknown) {
                // HTTP 408 is normal long-poll timeout — not an error
                if (err instanceof ApiError && err.statusCode === 408) {
                    continue;
                }

                if (this.errorHandler && err instanceof Error) {
                    this.errorHandler(err);
                }

                if (!this.running) break;

                // Exponential backoff
                await sleep(backoff);
                backoff = Math.min(backoff * 2, MAX_BACKOFF);
            }
        }
    }

    private processUpdate(update: ZaloUpdate): void {
        // Track offset: update_id if available, else message.date (OBS-3)
        if (update.update_id !== undefined) {
            this.pollOffset = update.update_id + 1;
        } else if (update.message?.date) {
            this.pollOffset = update.message.date;
        }

        // Only process text messages (Phase 1)
        // Zalo Bot API uses "event_name"; older versions may use "event"
        const eventName = update.event_name || update.event;
        if (eventName !== 'message.text.received') return;
        if (!update.message?.text || !update.message?.from?.id || !update.message?.chat?.id) return;

        if (!this.messageHandler) return;

        const msgId = update.message.message_id || `${Date.now()}_${Math.random().toString(36).substring(7)}`;

        this.messageHandler({
            channelId: 'zalo',
            chatId: update.message.chat.id,
            senderId: update.message.from.id,
            senderName: update.message.from.display_name || update.message.from.id,
            content: update.message.text,
            messageId: msgId,
            timestamp: update.message.date || Date.now(),
        });
    }

    /**
     * Call Zalo Bot Platform API. All methods use POST with JSON body.
     * Handles dual response envelope: { ok, result } or { error, message, data } (OBS-4)
     */
    private callApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
        return new Promise((resolve, reject) => {
            const url = `${this.apiBase}/${method}`;
            const body = JSON.stringify(payload);
            const parsed = new URL(url);

            this.abortController = new AbortController();

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
                timeout: HTTP_TIMEOUT,
                signal: this.abortController.signal as never,
            };

            const transport = parsed.protocol === 'https:' ? https : http;

            const req = transport.request(options, (res) => {
                let data = '';
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => {
                    // HTTP 408 = long-poll timeout
                    if (res.statusCode === 408) {
                        reject(new ApiError('Poll timeout', 408));
                        return;
                    }

                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        reject(new ApiError(`HTTP ${res.statusCode}: ${data}`, res.statusCode));
                        return;
                    }

                    try {
                        const json = JSON.parse(data);

                        // Standard envelope: { ok, result }
                        if ('ok' in json) {
                            if (json.ok) {
                                resolve(json.result as T);
                            } else {
                                reject(new ApiError(
                                    json.description || `API error ${json.error_code}`,
                                    json.error_code,
                                ));
                            }
                            return;
                        }

                        // Alternative envelope: { error, message, data } (OBS-4)
                        if ('error' in json) {
                            if (json.error === 0) {
                                resolve(json.data as T);
                            } else {
                                reject(new ApiError(
                                    json.message || `API error ${json.error}`,
                                    json.error,
                                ));
                            }
                            return;
                        }

                        // Unknown format — try to use as-is
                        resolve(json as T);
                    } catch {
                        reject(new Error(`Failed to parse API response: ${data.substring(0, 200)}`));
                    }
                });
            });

            req.on('error', (err: Error) => {
                if ((err as NodeJS.ErrnoException).code === 'ABORT_ERR') return;
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new ApiError('Request timeout', 408));
            });

            req.write(body);
            req.end();
        });
    }
}

class ApiError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
    }
}
