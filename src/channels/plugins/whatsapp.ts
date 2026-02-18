/**
 * WhatsApp Channel Plugin — CTO-2026-002 ACTION 3 (P1)
 *
 * Implements ChannelPlugin interface for WhatsApp Web.js.
 * Uses whatsapp-web.js with local auth and Puppeteer.
 */

import { Client as WAClient, LocalAuth, MessageMedia, MessageTypes } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { ChannelPlugin, IncomingChannelMessage, SendMessageOptions } from '../../lib/channel-plugin';

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const MEDIA_TYPES: string[] = [
    MessageTypes.IMAGE, MessageTypes.AUDIO, MessageTypes.VOICE,
    MessageTypes.VIDEO, MessageTypes.DOCUMENT, MessageTypes.STICKER,
];

function extFromMime(mime?: string): string {
    if (!mime) return '.bin';
    const map: Record<string, string> = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
        'image/webp': '.webp', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3',
        'audio/mp4': '.m4a', 'video/mp4': '.mp4', 'application/pdf': '.pdf',
    };
    return map[mime] || `.${mime.split('/')[1] || 'bin'}`;
}

export interface WhatsAppPluginConfig {
    sessionDir: string;
    filesDir: string;
}

export class WhatsAppPlugin implements ChannelPlugin {
    id = 'whatsapp';
    meta = { name: 'WhatsApp', icon: '📱', version: '1.0.0' };
    capabilities = {
        threading: false,
        reactions: true,
        fileAttachments: true,
        maxMessageLength: 65536,
    };

    private client: WAClient | null = null;
    private messageHandler: ((msg: IncomingChannelMessage) => void) | null = null;
    private readyHandler: (() => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private config: WhatsAppPluginConfig;

    constructor(config: WhatsAppPluginConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        this.client = new WAClient({
            authStrategy: new LocalAuth({ dataPath: this.config.sessionDir }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox', '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas',
                    '--no-first-run', '--no-zygote', '--disable-gpu',
                ],
            },
        });

        this.client.on('qr', (qr: string) => {
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            if (this.readyHandler) this.readyHandler();
        });

        this.client.on('auth_failure', (msg: string) => {
            if (this.errorHandler) this.errorHandler(new Error(`Auth failure: ${msg}`));
        });

        this.client.on('message_create', async (message) => {
            if (message.fromMe) return;
            if (!this.messageHandler) return;

            const hasMedia = message.hasMedia && MEDIA_TYPES.includes(message.type);
            const isChat = message.type === 'chat';
            if (!isChat && !hasMedia) return;

            const chat = await message.getChat();
            if (chat.isGroup) return;

            const contact = await message.getContact();
            const sender = contact.pushname || contact.name || message.from;
            const messageText = message.body || '';
            const msgId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;

            // Download media if present
            const downloadedFiles: string[] = [];
            if (hasMedia) {
                try {
                    const media = await message.downloadMedia();
                    if (media?.data) {
                        const byteLength = Buffer.byteLength(media.data, 'base64');
                        if (byteLength <= MAX_DOWNLOAD_BYTES) {
                            const ext = extFromMime(media.mimetype);
                            const filename = `whatsapp_${msgId}_${Date.now()}${ext}`;
                            const localPath = path.join(this.config.filesDir, filename);
                            fs.writeFileSync(localPath, Buffer.from(media.data, 'base64'));
                            downloadedFiles.push(localPath);
                        }
                    }
                } catch { /* media download failed, continue without */ }
            }

            if ((!messageText || messageText.trim().length === 0) && downloadedFiles.length === 0) return;

            this.messageHandler({
                channelId: 'whatsapp',
                chatId: message.from,
                senderId: message.from,
                senderName: sender,
                content: messageText,
                messageId: msgId,
                files: downloadedFiles.length > 0 ? downloadedFiles : undefined,
                timestamp: Date.now(),
            });
        });

        await this.client.initialize();
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
        }
    }

    async sendMessage(chatId: string, content: string, opts?: SendMessageOptions): Promise<void> {
        if (!this.client) throw new Error('WhatsApp plugin not connected');

        const waChat = await this.client.getChatById(chatId.includes('@') ? chatId : `${chatId}@c.us`);

        // Send files first
        if (opts?.files) {
            for (const file of opts.files) {
                if (!fs.existsSync(file)) continue;
                const media = MessageMedia.fromFilePath(file);
                await waChat.sendMessage(media);
            }
        }

        // Send text
        if (content) {
            await waChat.sendMessage(content);
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
