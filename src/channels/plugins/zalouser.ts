/**
 * Zalo Personal Channel Plugin
 *
 * Implements ChannelPlugin interface for Zalo Personal via zca-cli.
 * Wraps the zca binary: `zca listen -r -k` for receiving (JSON lines on stdout),
 * `zca msg send <threadId> <content>` for sending.
 *
 * Auth is external: user runs `zca auth login` before starting TinySDLC.
 *
 * Reference: PicoClaw pkg/channels/zalouser.go, OpenClaw extensions/zalouser/
 */

import { spawn, execFile, ChildProcess } from 'child_process';
import { createInterface, Interface as ReadlineInterface } from 'readline';
import { ChannelPlugin, IncomingChannelMessage, SendMessageOptions } from '../../lib/channel-plugin';

const MAX_MSG_LENGTH = 2000;
const MIN_BACKOFF = 5_000;        // 5s
const MAX_BACKOFF = 5 * 60_000;   // 5 min

interface ZcaMessage {
    threadId: string;
    msgId: string;
    type: number;           // 1=text
    content: string;
    timestamp: number;      // Unix milliseconds
    metadata: {
        threadType: number; // 1=DM, 2=group
        senderId: string;
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

export interface ZaloUserPluginConfig {
    filesDir: string;
    zcaPath?: string;     // Default: 'zca' (found in PATH)
    profile?: string;     // zca profile for multi-account
}

export class ZaloUserPlugin implements ChannelPlugin {
    id = 'zalouser';
    meta = { name: 'Zalo Personal', icon: '👤', version: '1.0.0' };
    capabilities = {
        threading: false,
        reactions: false,
        fileAttachments: false,
        maxMessageLength: MAX_MSG_LENGTH,
    };

    private running = false;
    private child: ChildProcess | null = null;
    private rl: ReadlineInterface | null = null;
    private restartTimer: ReturnType<typeof setTimeout> | null = null;
    private sending = false;
    private messageHandler: ((msg: IncomingChannelMessage) => void) | null = null;
    private readyHandler: (() => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private config: ZaloUserPluginConfig;
    private zcaBin: string;

    constructor(config: ZaloUserPluginConfig) {
        this.config = config;
        this.zcaBin = config.zcaPath || 'zca';
    }

    async connect(): Promise<void> {
        this.running = true;
        this.startListener();
    }

    async disconnect(): Promise<void> {
        this.running = false;

        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }

        if (this.child) {
            this.child.kill('SIGTERM');
            this.child = null;
        }
    }

    async sendMessage(chatId: string, content: string, _opts?: SendMessageOptions): Promise<void> {
        if (!this.running) throw new Error('Zalo Personal plugin not connected');

        // Serialize sends — no concurrent zca invocations
        while (this.sending) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        this.sending = true;

        try {
            const chunks = splitMessage(content);
            for (const chunk of chunks) {
                await this.zcaSend(chatId, chunk);
            }
        } finally {
            this.sending = false;
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

    private startListener(): void {
        const args = this.buildListenArgs();
        this.child = spawn(this.zcaBin, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        if (this.child.stdout) {
            this.rl = createInterface({ input: this.child.stdout });
            this.rl.on('line', (line) => this.processLine(line));
        }

        // Log stderr for debugging (auth errors etc.)
        if (this.child.stderr) {
            this.child.stderr.on('data', (data: Buffer) => {
                const msg = data.toString().trim();
                if (msg && this.errorHandler) {
                    this.errorHandler(new Error(`zca stderr: ${msg}`));
                }
            });
        }

        // Fire ready handler on successful spawn
        this.child.on('spawn', () => {
            if (this.readyHandler) this.readyHandler();
        });

        // Handle process exit — auto-restart with backoff
        this.child.on('exit', (code, signal) => {
            this.child = null;
            if (this.rl) { this.rl.close(); this.rl = null; }

            if (!this.running) return; // Clean shutdown

            const reason = signal ? `signal ${signal}` : `code ${code}`;
            if (this.errorHandler) {
                this.errorHandler(new Error(`zca listener exited (${reason}), will restart`));
            }

            this.scheduleRestart(MIN_BACKOFF);
        });

        this.child.on('error', (err) => {
            this.child = null;
            if (this.errorHandler) this.errorHandler(err);

            if (this.running) {
                this.scheduleRestart(MIN_BACKOFF);
            }
        });
    }

    private scheduleRestart(backoff: number): void {
        if (!this.running) return;

        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            if (!this.running) return;

            this.startListener();

            // Increase backoff for next potential restart
            // The child 'exit' handler always starts with MIN_BACKOFF,
            // but if it exits immediately we'll hit this path again quickly
        }, backoff);
    }

    private processLine(line: string): void {
        const trimmed = line.trim();
        if (!trimmed) return;

        let msg: ZcaMessage;
        try {
            msg = JSON.parse(trimmed);
        } catch {
            // Malformed JSON — skip (not fatal)
            return;
        }

        // Phase 1: text only (type === 1)
        if (msg.type !== 1) return;

        // DM only (threadType === 1), skip groups (threadType === 2)
        if (msg.metadata?.threadType !== 1) return;

        // Must have content and threadId
        if (!msg.content || !msg.threadId) return;

        if (!this.messageHandler) return;

        const senderId = msg.metadata?.senderId || msg.threadId;
        const msgId = msg.msgId || `${Date.now()}_${Math.random().toString(36).substring(7)}`;

        this.messageHandler({
            channelId: 'zalouser',
            chatId: msg.threadId,
            senderId: senderId,
            senderName: senderId, // zca doesn't provide display names
            content: msg.content,
            messageId: msgId,
            timestamp: msg.timestamp || Date.now(),
        });
    }

    private buildListenArgs(): string[] {
        const args: string[] = [];
        if (this.config.profile) {
            args.push('-p', this.config.profile);
        }
        args.push('listen', '-r', '-k');
        return args;
    }

    private zcaSend(chatId: string, content: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const args: string[] = [];
            if (this.config.profile) {
                args.push('-p', this.config.profile);
            }
            args.push('msg', 'send', chatId, content);

            execFile(this.zcaBin, args, { timeout: 30_000 }, (err) => {
                if (err) {
                    reject(new Error(`zca send failed: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }
}
