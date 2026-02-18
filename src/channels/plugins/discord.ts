/**
 * Discord Channel Plugin — CTO-2026-002 ACTION 3 (P1)
 *
 * Implements ChannelPlugin interface for Discord Bot API.
 * Uses discord.js with DM message handling.
 */

import { Client, Events, GatewayIntentBits, Partials, DMChannel, AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import { ChannelPlugin, IncomingChannelMessage, SendMessageOptions } from '../../lib/channel-plugin';

function splitMessage(text: string, maxLength = 2000): string[] {
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

export interface DiscordPluginConfig {
    botToken: string;
    filesDir: string;
}

export class DiscordPlugin implements ChannelPlugin {
    id = 'discord';
    meta = { name: 'Discord', icon: '🎮', version: '1.0.0' };
    capabilities = {
        threading: true,
        reactions: true,
        fileAttachments: true,
        maxMessageLength: 2000,
    };

    private client: Client | null = null;
    private messageHandler: ((msg: IncomingChannelMessage) => void) | null = null;
    private readyHandler: (() => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private config: DiscordPluginConfig;

    constructor(config: DiscordPluginConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
            ],
            partials: [Partials.Channel, Partials.Message],
        });

        this.client.on(Events.ClientReady, () => {
            if (this.readyHandler) this.readyHandler();
        });

        this.client.on(Events.MessageCreate, async (message) => {
            if (message.author.bot || message.guild) return;
            if (!this.messageHandler) return;

            const hasContent = message.content && message.content.trim().length > 0;
            const hasAttachments = message.attachments.size > 0;
            if (!hasContent && !hasAttachments) return;

            this.messageHandler({
                channelId: 'discord',
                chatId: message.author.id,
                senderId: message.author.id,
                senderName: message.author.username,
                content: message.content || '',
                messageId: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
                timestamp: Date.now(),
            });
        });

        await this.client.login(this.config.botToken);
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
    }

    async sendMessage(chatId: string, content: string, opts?: SendMessageOptions): Promise<void> {
        if (!this.client) throw new Error('Discord plugin not connected');

        const user = await this.client.users.fetch(chatId);
        const dmChannel = await user.createDM();

        // Send files
        if (opts?.files) {
            const attachments: AttachmentBuilder[] = [];
            for (const file of opts.files) {
                if (!fs.existsSync(file)) continue;
                attachments.push(new AttachmentBuilder(file));
            }
            if (attachments.length > 0) {
                await dmChannel.send({ files: attachments });
            }
        }

        // Send text in chunks
        if (content) {
            const chunks = splitMessage(content);
            for (const chunk of chunks) {
                await dmChannel.send(chunk);
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
