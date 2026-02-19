/**
 * Processing Status Indicators — Pattern F (S04 ZeroClaw)
 *
 * File-based status signaling via queue/status/ directory.
 * Queue processor writes a status file once before invokeAgent().
 * Channel clients poll the directory and compute elapsed time client-side.
 *
 * ADR-011: Consistent with TinySDLC's file-based queue architecture.
 * No new IPC mechanisms needed — channel clients already poll every second.
 *
 * CTO fix (applied): elapsedMs MUST be computed client-side as:
 *   Date.now() - status.startedAt
 * NOT read from the status file — it's write-once and would be stale.
 *
 * Pattern: follows input-sanitizer.ts (const array + pure function + typed result)
 */

import fs from 'fs';
import path from 'path';
import { TINYSDLC_HOME } from './config';

export const QUEUE_STATUS_DIR = path.join(TINYSDLC_HOME, 'queue/status');

/** Maximum age of a status file before it's considered orphaned (20 minutes) */
export const STATUS_MAX_AGE_MS = 20 * 60 * 1000;

/** Delay before first status message is sent to user (15 seconds) */
export const STATUS_INITIAL_DELAY_MS = 15 * 1000;

/** Interval between status updates for long-running tasks (30 seconds) */
export const STATUS_UPDATE_INTERVAL_MS = 30 * 1000;

export type ProcessingStatusType =
    | 'processing'
    | 'invoking_agent'
    | 'agent_responding'
    | 'formatting_response';

export interface ProcessingStatus {
    messageId: string;
    agentId: string;
    agentName: string;
    channel: string;
    sender: string;
    /** Channel-specific chat/user identifier for delivering status updates */
    chatId: string | number;
    status: ProcessingStatusType;
    /** Unix timestamp (ms) when processing started — used for client-side elapsed */
    startedAt: number;
}

/** Ensure the status directory exists before any read/write */
function ensureStatusDir(): void {
    if (!fs.existsSync(QUEUE_STATUS_DIR)) {
        fs.mkdirSync(QUEUE_STATUS_DIR, { recursive: true });
    }
}

/**
 * Write a processing status file to queue/status/.
 * Called by queue-processor before invokeAgent().
 *
 * Write-once pattern: do NOT update this file after writing.
 * Channel clients compute elapsed time as: Date.now() - status.startedAt
 */
export function writeStatus(status: ProcessingStatus): void {
    ensureStatusDir();
    const file = path.join(QUEUE_STATUS_DIR, `${status.messageId}.json`);
    fs.writeFileSync(file, JSON.stringify(status, null, 2));
}

/**
 * Remove the processing status file after the agent response is received.
 * Safe to call if the file does not exist (e.g. when status is disabled).
 */
export function clearStatus(messageId: string): void {
    const file = path.join(QUEUE_STATUS_DIR, `${messageId}.json`);
    try {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    } catch {
        // Best-effort cleanup — ignore filesystem errors
    }
}

/**
 * Read all current status files, filtering out orphaned entries (>20 min old).
 * Orphaned files (from crashed processors) are deleted when encountered.
 *
 * Called by channel clients in their polling loop.
 */
export function readStatuses(): ProcessingStatus[] {
    ensureStatusDir();
    const now = Date.now();
    const results: ProcessingStatus[] = [];

    let files: string[];
    try {
        files = fs.readdirSync(QUEUE_STATUS_DIR).filter(f => f.endsWith('.json'));
    } catch {
        return [];
    }

    for (const file of files) {
        try {
            const raw = fs.readFileSync(path.join(QUEUE_STATUS_DIR, file), 'utf8');
            const status = JSON.parse(raw) as ProcessingStatus;
            // Delete orphaned status files (>20 min old — processor likely crashed)
            if (now - status.startedAt > STATUS_MAX_AGE_MS) {
                fs.unlinkSync(path.join(QUEUE_STATUS_DIR, file));
                continue;
            }
            results.push(status);
        } catch {
            // Ignore unreadable or malformed files
        }
    }

    return results;
}

/**
 * Format a human-readable processing status message for delivery to users.
 *
 * CTO fix: elapsed time is computed from nowMs - status.startedAt (client-side).
 * NEVER read elapsed from the status file — it is written once and would be stale.
 *
 * @param status - The status object read from disk
 * @param nowMs - Current timestamp in ms (optional; defaults to Date.now())
 */
export function formatStatusMessage(status: ProcessingStatus, nowMs?: number): string {
    const elapsed = ((nowMs ?? Date.now()) - status.startedAt) / 1000;
    const seconds = Math.floor(elapsed);
    const timeStr = seconds >= 60
        ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        : `${seconds}s`;
    return `⏳ Still working... @${status.agentId} (${status.agentName}) has been processing for ${timeStr}.`;
}
