/**
 * Channel Plugin Interface — CTO-2026-002 ACTION 3 (P1)
 *
 * Defines the common contract for all OTT channel implementations.
 * Existing channels (Telegram, Discord, WhatsApp) become plugins that implement this interface.
 * New channels (Zalo, Line, Slack) can be added with zero core changes.
 *
 * Spec source: OpenClaw `src/channels/plugins/types.plugin.ts` + CTO Directive Section 3.3
 */

export interface ChannelPluginMeta {
    name: string;       // Human-readable name (e.g. "Telegram")
    icon: string;       // Emoji or short identifier
    version: string;    // Plugin version
}

export interface ChannelCapabilities {
    threading: boolean;       // Supports message threads
    reactions: boolean;       // Supports emoji reactions
    fileAttachments: boolean; // Supports file uploads/downloads
    maxMessageLength: number; // Character limit per message
}

export interface IncomingChannelMessage {
    channelId: string;        // Channel identifier (e.g. "telegram")
    chatId: string;           // Platform-specific chat/conversation ID
    senderId: string;         // Platform-specific sender ID
    senderName: string;       // Human-readable sender name
    content: string;          // Message text
    messageId: string;        // Platform-specific message ID
    files?: string[];         // Local paths to downloaded attachments
    timestamp: number;        // Unix timestamp
}

export interface SendMessageOptions {
    replyToMessageId?: string;   // Platform-specific message ID to reply to
    files?: string[];            // Local file paths to attach
}

export interface ChannelPlugin {
    /** Unique channel identifier (e.g. "telegram", "discord", "whatsapp") */
    id: string;

    /** Channel metadata */
    meta: ChannelPluginMeta;

    /** Channel capabilities */
    capabilities: ChannelCapabilities;

    /** Initialize and connect to the channel platform */
    connect(): Promise<void>;

    /** Gracefully disconnect from the channel platform */
    disconnect(): Promise<void>;

    /** Send a message to a specific chat */
    sendMessage(chatId: string, content: string, opts?: SendMessageOptions): Promise<void>;

    /** Register handler for incoming messages */
    onMessage(handler: (msg: IncomingChannelMessage) => void): void;

    /** Register handler for when the channel is ready (optional) */
    onReady?(handler: () => void): void;

    /** Register handler for channel errors (optional) */
    onError?(handler: (error: Error) => void): void;
}
