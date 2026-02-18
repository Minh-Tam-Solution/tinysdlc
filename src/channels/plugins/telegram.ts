/**
 * Telegram Channel Plugin — CTO-2026-002 ACTION 3 (P1)
 *
 * Implements ChannelPlugin interface for Telegram Bot API.
 * Uses node-telegram-bot-api in polling mode.
 */

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { ChannelPlugin, IncomingChannelMessage, SendMessageOptions } from '../../lib/channel-plugin';

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

function downloadFile(url: string, destPath: string, _redirectDepth = 0): Promise<void> {
    if (_redirectDepth > 5) return Promise.reject(new Error('Too many redirects'));
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        function handleResponse(response: http.IncomingMessage): void {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    fs.unlink(destPath, () => {});
                    downloadFile(redirectUrl, destPath, _redirectDepth + 1).then(resolve).catch(reject);
                    return;
                }
            }
            const contentLength = parseInt(response.headers['content-length'] || '0', 10);
            if (contentLength > MAX_DOWNLOAD_BYTES) {
                response.destroy(); file.close(); fs.unlink(destPath, () => {});
                reject(new Error(`File too large: ${contentLength} bytes`));
                return;
            }
            let received = 0;
            response.on('data', (chunk: Buffer) => {
                received += chunk.length;
                if (received > MAX_DOWNLOAD_BYTES) {
                    response.destroy(); file.close(); fs.unlink(destPath, () => {});
                    reject(new Error(`Download exceeded ${MAX_DOWNLOAD_BYTES} bytes limit`));
                }
            });
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }
        (url.startsWith('https') ? https.get(url, handleResponse) : http.get(url, handleResponse))
            .on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    });
}

function splitMessage(text: string, maxLength = 4096): string[] {
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

export interface TelegramPluginConfig {
    botToken: string;
    filesDir: string;
}

export class TelegramPlugin implements ChannelPlugin {
    id = 'telegram';
    meta = { name: 'Telegram', icon: '✈', version: '1.0.0' };
    capabilities = {
        threading: false,
        reactions: true,
        fileAttachments: true,
        maxMessageLength: 4096,
    };

    private bot: TelegramBot | null = null;
    private messageHandler: ((msg: IncomingChannelMessage) => void) | null = null;
    private readyHandler: (() => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private config: TelegramPluginConfig;

    constructor(config: TelegramPluginConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        this.bot = new TelegramBot(this.config.botToken, { polling: true });

        this.bot.on('message', async (msg: TelegramBot.Message) => {
            if (msg.chat.type !== 'private' || !this.messageHandler) return;

            const messageText = msg.text || msg.caption || '';
            if (!messageText || messageText.trim().length === 0) return;

            const sender = msg.from
                ? (msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : ''))
                : 'Unknown';

            this.messageHandler({
                channelId: 'telegram',
                chatId: msg.chat.id.toString(),
                senderId: msg.chat.id.toString(),
                senderName: sender,
                content: messageText,
                messageId: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
                timestamp: Date.now(),
            });
        });

        this.bot.on('polling_error', (error: Error) => {
            if (this.errorHandler) this.errorHandler(error);
        });

        try {
            const me = await this.bot.getMe();
            if (this.readyHandler) this.readyHandler();
        } catch (err) {
            if (this.errorHandler) this.errorHandler(err as Error);
            throw err;
        }
    }

    async disconnect(): Promise<void> {
        if (this.bot) {
            this.bot.stopPolling();
            this.bot = null;
        }
    }

    async sendMessage(chatId: string, content: string, opts?: SendMessageOptions): Promise<void> {
        if (!this.bot) throw new Error('Telegram plugin not connected');

        const numericChatId = Number(chatId);

        // Send files first
        if (opts?.files) {
            for (const file of opts.files) {
                if (!fs.existsSync(file)) continue;
                const ext = path.extname(file).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
                    await this.bot.sendPhoto(numericChatId, file);
                } else if (['.mp3', '.ogg', '.wav', '.m4a'].includes(ext)) {
                    await this.bot.sendAudio(numericChatId, file);
                } else if (['.mp4', '.avi', '.mov', '.webm'].includes(ext)) {
                    await this.bot.sendVideo(numericChatId, file);
                } else {
                    await this.bot.sendDocument(numericChatId, file);
                }
            }
        }

        // Send text in chunks
        if (content) {
            const chunks = splitMessage(content);
            for (let i = 0; i < chunks.length; i++) {
                const sendOpts: TelegramBot.SendMessageOptions = {};
                if (i === 0 && opts?.replyToMessageId) {
                    sendOpts.reply_to_message_id = Number(opts.replyToMessageId);
                }
                await this.bot.sendMessage(numericChatId, chunks[i], sendOpts);
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
}
