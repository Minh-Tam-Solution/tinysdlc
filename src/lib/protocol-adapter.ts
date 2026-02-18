/**
 * Canonical Protocol Adapter — CTO-2026-002 ACTION 2 (P0)
 *
 * Translates between TinySDLC internal message format (MessageData/ResponseData)
 * and SDLC Orchestrator's canonical message protocol (CanonicalAgentMessage).
 *
 * Gated by `settings.orchestrator_integration.enabled` (default: false).
 * ADR-056 FINALIZED — schema aligned with agent_messages table (Section 4.3).
 *
 * Decision 4: Protocol owner = Orchestrator. TinySDLC is a client; never sends raw internal format.
 */

import crypto from 'crypto';
import { MessageData, ResponseData } from './types';
import { FailoverReason } from './failover';

// --- Canonical types (per ADR-056 Section 4.3 agent_messages schema) ---

export type SenderType = 'user' | 'agent' | 'system';
export type MessageType = 'request' | 'response' | 'mention' | 'system' | 'interrupt';
export type QueueMode = 'queue' | 'steer' | 'interrupt';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';

export interface CanonicalAgentMessage {
    id: string;                      // UUID
    conversation_id: string;         // UUID
    parent_message_id?: string;      // UUID — thread support
    sender_type: SenderType;
    sender_id: string;
    recipient_id: string;
    content: string;
    mentions: string[];              // Parsed [@agent: message] tags
    message_type: MessageType;
    queue_mode: QueueMode;
    processing_status: ProcessingStatus;
    processing_lane: string;         // Lane for concurrency control
    dedupe_key?: string;             // Idempotency (UNIQUE)
    correlation_id: string;          // Request tracing UUID
    token_count?: number;
    latency_ms?: number;
    provider_used?: string;
    failover_reason?: FailoverReason;
    failed_count: number;
    last_error?: string;
    next_retry_at?: string;          // ISO 8601
    evidence_id?: string;            // FK to gate_evidence (nullable)
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
    const agentId = data.agent || '';

    return {
        id: crypto.randomUUID(),
        conversation_id: data.conversationId || crypto.randomUUID(),
        sender_type: resolveSenderType(data),
        sender_id: data.fromAgent || data.senderId || data.sender,
        recipient_id: agentId,
        content: data.message,
        mentions,
        message_type: resolveMessageType(data),
        queue_mode: 'queue',
        processing_status: 'pending',
        processing_lane: agentId || 'default',
        correlation_id: data.correlation_id || crypto.randomUUID(),
        dedupe_key: `${data.messageId}_${data.timestamp}`,
        failed_count: 0,
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
        sender: canonical.sender_id,
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
    const agentId = data.agent || 'unknown';

    return {
        id: crypto.randomUUID(),
        conversation_id: correlationId || crypto.randomUUID(),
        sender_type: 'agent',
        sender_id: agentId,
        recipient_id: data.senderId || data.sender,
        content: data.message,
        mentions: [],
        message_type: 'response',
        queue_mode: 'queue',
        processing_status: 'completed',
        processing_lane: agentId,
        correlation_id: correlationId || crypto.randomUUID(),
        dedupe_key: `${data.messageId}_${data.timestamp}`,
        failed_count: 0,
        created_at: new Date(data.timestamp).toISOString(),
    };
}
