/**
 * Canonical Protocol Adapter — CTO-2026-002 ACTION 2 (P0)
 *
 * Translates between TinySDLC internal message format (MessageData/ResponseData)
 * and SDLC Orchestrator's canonical message protocol (CanonicalAgentMessage).
 *
 * Gated by `settings.orchestrator_integration.enabled` (default: false).
 * Blocked on ADR-056 publication — interface designed now, finalize after schema is published.
 *
 * Constraint 6.1: Protocol owner = Orchestrator. TinySDLC translates; never sends raw internal format.
 */

import crypto from 'crypto';
import { MessageData, ResponseData } from './types';

// --- Canonical types (per CTO Directive Section 3.2 / ADR-056 draft) ---

export type SenderType = 'user' | 'agent' | 'system';
export type MessageType = 'request' | 'response' | 'mention' | 'system' | 'interrupt';
export type QueueMode = 'queue' | 'steer' | 'interrupt';

export interface CanonicalAgentMessage {
    id: string;                      // UUID
    conversation_id: string;         // UUID
    sender_type: SenderType;
    sender_id: string;
    recipient_id: string;
    content: string;
    mentions: string[];              // Parsed @agent mentions
    message_type: MessageType;
    queue_mode: QueueMode;
    correlation_id: string;          // Request tracing
    dedupe_key?: string;             // Idempotency
    created_at: string;              // ISO 8601
}

// --- Conversion helpers ---

/**
 * Extract @agent mentions from message content.
 */
function extractMentions(content: string): string[] {
    const mentions: string[] = [];
    const mentionRegex = /\[@(\S+?):/g;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push(match[1]);
    }
    return mentions;
}

/**
 * Determine sender_type from MessageData context.
 */
function resolveSenderType(data: MessageData): SenderType {
    if (data.fromAgent) return 'agent';
    return 'user';
}

/**
 * Determine message_type from MessageData context.
 */
function resolveMessageType(data: MessageData): MessageType {
    if (data.fromAgent) return 'mention';
    return 'request';
}

// --- Public API ---

/**
 * Convert TinySDLC internal MessageData → Orchestrator CanonicalAgentMessage.
 */
export function toCanonical(data: MessageData): CanonicalAgentMessage {
    const mentions = extractMentions(data.message);

    return {
        id: crypto.randomUUID(),
        conversation_id: data.conversationId || crypto.randomUUID(),
        sender_type: resolveSenderType(data),
        sender_id: data.fromAgent || data.senderId || data.sender,
        recipient_id: data.agent || '',
        content: data.message,
        mentions,
        message_type: resolveMessageType(data),
        queue_mode: 'queue',
        correlation_id: data.correlation_id || crypto.randomUUID(),
        dedupe_key: `${data.messageId}_${data.timestamp}`,
        created_at: new Date(data.timestamp).toISOString(),
    };
}

/**
 * Convert Orchestrator CanonicalAgentMessage → TinySDLC internal MessageData.
 */
export function fromCanonical(canonical: CanonicalAgentMessage, channel: string = 'orchestrator'): MessageData {
    // Reconstruct routing prefix from recipient_id if present
    const routingPrefix = canonical.recipient_id ? `@${canonical.recipient_id} ` : '';
    const message = canonical.message_type === 'mention'
        ? canonical.content
        : routingPrefix + canonical.content;

    return {
        channel,
        sender: canonical.sender_type === 'agent' ? canonical.sender_id : canonical.sender_id,
        senderId: canonical.sender_id,
        message,
        timestamp: new Date(canonical.created_at).getTime() || Date.now(),
        messageId: canonical.id,
        agent: canonical.recipient_id || undefined,
        conversationId: canonical.conversation_id,
        fromAgent: canonical.sender_type === 'agent' ? canonical.sender_id : undefined,
        correlation_id: canonical.correlation_id,
    };
}

/**
 * Convert TinySDLC ResponseData → Orchestrator CanonicalAgentMessage (outbound).
 */
export function responseToCanonical(data: ResponseData, correlationId?: string): CanonicalAgentMessage {
    return {
        id: crypto.randomUUID(),
        conversation_id: correlationId || crypto.randomUUID(),
        sender_type: 'agent',
        sender_id: data.agent || 'unknown',
        recipient_id: data.senderId || data.sender,
        content: data.message,
        mentions: [],
        message_type: 'response',
        queue_mode: 'queue',
        correlation_id: correlationId || crypto.randomUUID(),
        dedupe_key: `${data.messageId}_${data.timestamp}`,
        created_at: new Date(data.timestamp).toISOString(),
    };
}
