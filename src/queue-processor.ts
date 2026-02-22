#!/usr/bin/env node
/**
 * Queue Processor - Handles messages from all channels (WhatsApp, Telegram, etc.)
 *
 * Supports multi-agent routing:
 *   - Messages prefixed with @agent_id are routed to that agent
 *   - Unrouted messages go to the "default" agent
 *   - Each agent has its own provider, model, working directory, and system prompt
 *   - Conversation isolation via per-agent working directories
 *
 * Team conversations use queue-based message passing:
 *   - Agent mentions ([@teammate: message]) become new messages in the queue
 *   - Each agent processes messages naturally via its own promise chain
 *   - Conversations complete when all branches resolve (no more pending mentions)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MessageData, ResponseData, QueueFile, ChainStep, Conversation, Settings, TeamConfig } from './lib/types';
import {
    QUEUE_INCOMING, QUEUE_OUTGOING, QUEUE_PROCESSING,
    LOG_FILE, EVENTS_DIR, CHATS_DIR, FILES_DIR,
    getSettings, getAgents, getTeams,
    DEFAULT_MAX_DELEGATION_DEPTH, DEFAULT_INPUT_SANITIZATION_ENABLED,
    resolveSprintFile
} from './lib/config';
import { log, emitEvent } from './lib/logging';
import { parseAgentRouting, findTeamForAgent, getAgentResetFlag, extractTeammateMentions } from './lib/routing';
import { invokeAgent } from './lib/invoke';
import { sanitize } from './lib/input-sanitizer';
import { handleCommand } from './lib/commands';
import { scrubCredentials } from './lib/credential-scrubber';
import { writeStatus, clearStatus } from './lib/processing-status';
import * as pluginLoader from './channels/plugin-loader';
import { ZaloPlugin } from './channels/plugins/zalo';
import { ZaloUserPlugin } from './channels/plugins/zalouser';
import { IncomingChannelMessage } from './lib/channel-plugin';

// Ensure directories exist
[QUEUE_INCOMING, QUEUE_OUTGOING, QUEUE_PROCESSING, FILES_DIR, path.dirname(LOG_FILE)].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Files currently queued in a promise chain — prevents duplicate processing across ticks
const queuedFiles = new Set<string>();

// Active conversations — tracks in-flight team message passing
const conversations = new Map<string, Conversation>();

const MAX_CONVERSATION_MESSAGES = 50;
const LONG_RESPONSE_THRESHOLD = 4000;

/**
 * If a response exceeds the threshold, save full text as a .md file
 * and return a truncated preview with the file attached.
 */
function handleLongResponse(
    response: string,
    existingFiles: string[]
): { message: string; files: string[] } {
    if (response.length <= LONG_RESPONSE_THRESHOLD) {
        return { message: response, files: existingFiles };
    }

    // Save full response as a .md file
    const filename = `response_${Date.now()}.md`;
    const filePath = path.join(FILES_DIR, filename);
    fs.writeFileSync(filePath, response);
    log('INFO', `Long response (${response.length} chars) saved to ${filename}`);

    // Truncate to preview
    const preview = response.substring(0, LONG_RESPONSE_THRESHOLD) + '\n\n_(Full response attached as file)_';

    return { message: preview, files: [...existingFiles, filePath] };
}

// Recover orphaned files from processing/ on startup (crash recovery)
function recoverOrphanedFiles() {
    for (const f of fs.readdirSync(QUEUE_PROCESSING).filter(f => f.endsWith('.json'))) {
        try {
            fs.renameSync(path.join(QUEUE_PROCESSING, f), path.join(QUEUE_INCOMING, f));
            log('INFO', `Recovered orphaned file: ${f}`);
        } catch (error) {
            log('ERROR', `Failed to recover orphaned file ${f}: ${(error as Error).message}`);
        }
    }
}

/**
 * Enqueue an internal (agent-to-agent) message into QUEUE_INCOMING.
 */
function enqueueInternalMessage(
    conversationId: string,
    fromAgent: string,
    targetAgent: string,
    message: string,
    originalData: MessageData
): void {
    // CTO-2026-002 ACTION 5: Propagate delegation depth + correlation_id
    const currentDepth = originalData.delegation_depth || 0;
    const internalMessage: MessageData = {
        channel: originalData.channel,
        sender: originalData.sender,
        senderId: originalData.senderId,
        message,
        timestamp: Date.now(),
        messageId: originalData.messageId,
        agent: targetAgent,
        conversationId,
        fromAgent,
        delegation_depth: currentDepth + 1,
        correlation_id: originalData.correlation_id,
    };

    const filename = `internal_${conversationId}_${targetAgent}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`;
    fs.writeFileSync(path.join(QUEUE_INCOMING, filename), JSON.stringify(internalMessage, null, 2));
    log('INFO', `Enqueued internal message: @${fromAgent} → @${targetAgent} (depth: ${currentDepth + 1})`);
}

/**
 * Collect files from a response text.
 */
function collectFiles(response: string, fileSet: Set<string>): void {
    const fileRegex = /\[send_file:\s*([^\]]+)\]/g;
    const allowedBase = path.resolve(FILES_DIR);
    let match: RegExpExecArray | null;
    while ((match = fileRegex.exec(response)) !== null) {
        const rawPath = match[1].trim();
        const resolved = path.resolve(rawPath);
        // SEC-014: only allow files within FILES_DIR — prevents agent from
        // exfiltrating arbitrary files (e.g. ~/.ssh/id_rsa, /etc/passwd)
        if (!resolved.startsWith(allowedBase + path.sep) && resolved !== allowedBase) {
            log('WARN', `[SEC] send_file blocked — path outside FILES_DIR: ${rawPath}`);
            continue;
        }
        if (fs.existsSync(resolved)) fileSet.add(resolved);
    }
}

/**
 * S05: Append an entry to CURRENT-SPRINT.md Activity Log section.
 * Best-effort — race condition possible if multiple conversations complete simultaneously
 * (acceptable at LITE tier).
 */
function appendActivityLog(sprintFile: string, agentIds: string[], responseLength: number): void {
    try {
        let content = fs.readFileSync(sprintFile, 'utf8');
        const marker = '## Activity Log';
        const markerIdx = content.indexOf(marker);
        if (markerIdx === -1) return;

        const now = new Date();
        const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const agentStr = agentIds.map(id => `@${id}`).join(', ');
        const entry = `- [${ts}] ${agentStr}: conversation completed (${responseLength} chars)`;

        // Find insertion point (after marker line + any comment line)
        const afterMarker = content.indexOf('\n', markerIdx);
        if (afterMarker === -1) return;
        let insertAt = afterMarker + 1;
        // Skip <!-- comment --> line if present
        const nextLine = content.substring(insertAt).split('\n')[0];
        if (nextLine.trim().startsWith('<!--')) {
            const commentEnd = content.indexOf('\n', insertAt);
            if (commentEnd !== -1) insertAt = commentEnd + 1;
        }

        // Collect existing entries
        const beforeInsert = content.substring(0, insertAt);
        const afterInsert = content.substring(insertAt);
        const existingLines = afterInsert.split('\n').filter(l => l.startsWith('- ['));

        // Cap at 20 entries (keep newest, trim oldest)
        const MAX_LOG_ENTRIES = 20;
        const allEntries = [entry, ...existingLines].slice(0, MAX_LOG_ENTRIES);

        // Rebuild content
        const remainingContent = afterInsert.split('\n').filter(l => !l.startsWith('- [')).join('\n');
        content = beforeInsert + allEntries.join('\n') + '\n' + remainingContent;

        fs.writeFileSync(sprintFile, content);
        log('DEBUG', `[SPRINT] Activity log appended: ${agentStr} (${responseLength} chars)`);
    } catch (e) {
        log('WARN', `[SPRINT] Failed to append activity log: ${(e as Error).message}`);
    }
}

/**
 * Complete a conversation: aggregate responses, write to outgoing queue, save chat history.
 */
function completeConversation(conv: Conversation): void {
    const settings = getSettings();
    const agents = getAgents(settings);

    log('INFO', `Conversation ${conv.id} complete — ${conv.responses.length} response(s), ${conv.totalMessages} total message(s)`);
    emitEvent('team_chain_end', {
        teamId: conv.teamContext.teamId,
        totalSteps: conv.responses.length,
        agents: conv.responses.map(s => s.agentId),
    });

    // Aggregate responses
    let finalResponse: string;
    if (conv.responses.length === 1) {
        finalResponse = conv.responses[0].response;
    } else {
        finalResponse = conv.responses
            .map(step => `@${step.agentId}: ${step.response}`)
            .join('\n\n------\n\n');
    }

    // Save chat history
    try {
        const teamChatsDir = path.join(CHATS_DIR, conv.teamContext.teamId);
        if (!fs.existsSync(teamChatsDir)) {
            fs.mkdirSync(teamChatsDir, { recursive: true });
        }
        const chatLines: string[] = [];
        chatLines.push(`# Team Conversation: ${conv.teamContext.team.name} (@${conv.teamContext.teamId})`);
        chatLines.push(`**Date:** ${new Date().toISOString()}`);
        chatLines.push(`**Channel:** ${conv.channel} | **Sender:** ${conv.sender}`);
        chatLines.push(`**Messages:** ${conv.totalMessages}`);
        chatLines.push('');
        chatLines.push('------');
        chatLines.push('');
        chatLines.push(`## User Message`);
        chatLines.push('');
        chatLines.push(conv.originalMessage);
        chatLines.push('');
        for (let i = 0; i < conv.responses.length; i++) {
            const step = conv.responses[i];
            const stepAgent = agents[step.agentId];
            const stepLabel = stepAgent ? `${stepAgent.name} (@${step.agentId})` : `@${step.agentId}`;
            chatLines.push('------');
            chatLines.push('');
            chatLines.push(`## ${stepLabel}`);
            chatLines.push('');
            chatLines.push(step.response);
            chatLines.push('');
        }
        const now = new Date();
        const dateTime = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
        fs.writeFileSync(path.join(teamChatsDir, `${dateTime}.md`), chatLines.join('\n'));
        log('INFO', `Chat history saved`);
    } catch (e) {
        log('ERROR', `Failed to save chat history: ${(e as Error).message}`);
    }

    // S05: Append to CURRENT-SPRINT.md activity log
    const workspacePath = settings?.workspace?.path || path.join(require('os').homedir(), 'tinysdlc-workspace');
    const sprintFilePath = resolveSprintFile(settings, workspacePath);
    if (sprintFilePath) {
        const agentIds = conv.responses.map(s => s.agentId);
        const totalChars = conv.responses.reduce((sum, s) => sum + s.response.length, 0);
        appendActivityLog(sprintFilePath, agentIds, totalChars);
    }

    // Detect file references
    finalResponse = finalResponse.trim();
    const outboundFilesSet = new Set<string>(conv.files);
    collectFiles(finalResponse, outboundFilesSet);
    const outboundFiles = Array.from(outboundFilesSet);

    // Remove [send_file: ...] tags
    if (outboundFiles.length > 0) {
        finalResponse = finalResponse.replace(/\[send_file:\s*[^\]]+\]/g, '').trim();
    }

    // Remove [@agent: ...] tags from final response
    finalResponse = finalResponse.replace(/\[@\S+?:\s*[\s\S]*?\]/g, '').trim();

    // Handle long responses — send as file attachment
    const { message: responseMessage, files: allFiles } = handleLongResponse(finalResponse, outboundFiles);

    // Write to outgoing queue
    const responseData: ResponseData = {
        channel: conv.channel,
        sender: conv.sender,
        senderId: conv.senderId,
        message: responseMessage,
        originalMessage: conv.originalMessage,
        timestamp: Date.now(),
        messageId: conv.messageId,
        files: allFiles.length > 0 ? allFiles : undefined,
    };

    const responseFile = conv.channel === 'heartbeat'
        ? path.join(QUEUE_OUTGOING, `${conv.messageId}.json`)
        : path.join(QUEUE_OUTGOING, `${conv.channel}_${conv.messageId}_${Date.now()}.json`);

    fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));

    log('INFO', `✓ Response ready [${conv.channel}] ${conv.sender} (${finalResponse.length} chars)`);
    emitEvent('response_ready', { channel: conv.channel, sender: conv.sender, responseLength: finalResponse.length, responseText: finalResponse, messageId: conv.messageId });

    // Clean up
    conversations.delete(conv.id);
}

// Process a single message
async function processMessage(messageFile: string): Promise<void> {
    const processingFile = path.join(QUEUE_PROCESSING, path.basename(messageFile));

    try {
        // Move to processing to mark as in-progress
        fs.renameSync(messageFile, processingFile);

        // Read message
        const messageData: MessageData = JSON.parse(fs.readFileSync(processingFile, 'utf8'));
        const { channel, sender, message: rawMessage, timestamp, messageId } = messageData;
        const isInternal = !!messageData.conversationId;

        log('INFO', `Processing [${isInternal ? 'internal' : channel}] ${isInternal ? `@${messageData.fromAgent}→@${messageData.agent}` : `from ${sender}`}: ${rawMessage.substring(0, 50)}...`);
        if (!isInternal) {
            emitEvent('message_received', { channel, sender, message: rawMessage.substring(0, 120), messageId });
        }

        // Get settings, agents, and teams
        const settings = getSettings();
        const agents = getAgents(settings);
        const teams = getTeams(settings);

        // CTO-2026-002 Constraint 6.5: Input sanitization (external messages only)
        if (!isInternal) {
            const sanitizationEnabled = settings.input_sanitization_enabled !== false; // default: true
            if (sanitizationEnabled) {
                const sanitizeResult = sanitize(messageData.message);
                if (sanitizeResult.modified) {
                    log('WARN', `[SANITIZE] Input modified for ${sender} on ${channel}: stripped [${sanitizeResult.patternsMatched.join(', ')}]`);
                    messageData.message = sanitizeResult.content;
                }
            }

            // S04 Pattern A: Credential scrubbing (after injection-pattern strip, before agent routing)
            const credScrubEnabled = settings.credential_scrubbing_enabled !== false; // default: true
            if (credScrubEnabled) {
                const credResult = scrubCredentials(messageData.message);
                if (credResult.modified) {
                    log('WARN', `[CRED-SCRUB] Credentials detected and redacted for ${sender} on ${channel}: [${credResult.credentialsFound.join(', ')}]`);
                    messageData.message = credResult.content;
                }
            }

        }

        // Get workspace path from settings
        const workspacePath = settings?.workspace?.path || path.join(require('os').homedir(), 'tinysdlc-workspace');

        // S03: Command intercept — handle /agent, /team, /reset, /workspace
        // Intercepted here so ALL channels (legacy + plugin) benefit (CTO OBS-1)
        if (!isInternal) {
            const cmdResult = handleCommand(messageData.message, workspacePath);
            if (cmdResult) {
                log('INFO', `Command handled: ${messageData.message.substring(0, 40)}`);
                const responseData: ResponseData = {
                    channel,
                    sender,
                    senderId: messageData.senderId,
                    message: cmdResult.response,
                    originalMessage: rawMessage,
                    timestamp: Date.now(),
                    messageId,
                };
                const responseFile = path.join(QUEUE_OUTGOING, path.basename(processingFile));
                fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));
                fs.unlinkSync(processingFile);
                return;
            }
        }

        // Route message to agent (or team)
        let agentId: string;
        let message: string;
        let isTeamRouted = false;

        if (messageData.agent && agents[messageData.agent]) {
            // Pre-routed (by channel client or internal message)
            agentId = messageData.agent;
            message = rawMessage;
        } else {
            // Parse @agent or @team prefix
            const routing = parseAgentRouting(rawMessage, agents, teams);
            agentId = routing.agentId;
            message = routing.message;
            isTeamRouted = !!routing.isTeam;
        }

        // Easter egg: Handle multiple agent mentions (only for external messages)
        if (!isInternal && agentId === 'error') {
            log('INFO', `Multiple agents detected, sending easter egg message`);

            const responseFile = path.join(QUEUE_OUTGOING, path.basename(processingFile));
            const responseData: ResponseData = {
                channel,
                sender,
                message: message,
                originalMessage: rawMessage,
                timestamp: Date.now(),
                messageId,
            };

            fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));
            fs.unlinkSync(processingFile);
            log('INFO', `✓ Easter egg sent to ${sender}`);
            return;
        }

        // Fall back to default if agent not found
        if (!agents[agentId]) {
            agentId = 'default';
            message = rawMessage;
        }

        // Final fallback: use first available agent if no default
        if (!agents[agentId]) {
            agentId = Object.keys(agents)[0];
        }

        const agent = agents[agentId];
        log('INFO', `Routing to agent: ${agent.name} (${agentId}) [${agent.provider}/${agent.model}]`);
        if (!isInternal) {
            emitEvent('agent_routed', { agentId, agentName: agent.name, provider: agent.provider, model: agent.model, isTeamRouted });
        }

        // Determine team context
        let teamContext: { teamId: string; team: TeamConfig } | null = null;
        if (isInternal) {
            // Internal messages inherit team context from their conversation
            const conv = conversations.get(messageData.conversationId!);
            if (conv) teamContext = conv.teamContext;
        } else {
            if (isTeamRouted) {
                for (const [tid, t] of Object.entries(teams)) {
                    if (t.leader_agent === agentId && t.agents.includes(agentId)) {
                        teamContext = { teamId: tid, team: t };
                        break;
                    }
                }
            }
            if (!teamContext) {
                teamContext = findTeamForAgent(agentId, teams);
            }
        }

        // Check for per-agent reset
        const agentResetFlag = getAgentResetFlag(agentId, workspacePath);
        const shouldReset = fs.existsSync(agentResetFlag);

        if (shouldReset) {
            fs.unlinkSync(agentResetFlag);
        }

        // For internal messages: append pending response indicator so the agent
        // knows other teammates are still processing and won't re-mention them.
        if (isInternal && messageData.conversationId) {
            const conv = conversations.get(messageData.conversationId);
            if (conv) {
                // pending includes this message (not yet decremented), so subtract 1 for "others"
                const othersPending = conv.pending - 1;
                if (othersPending > 0) {
                    message += `\n\n------\n\n[${othersPending} other teammate response(s) are still being processed and will be delivered when ready. Do not re-mention teammates who haven't responded yet.]`;
                }
            }
        }

        // Invoke agent
        emitEvent('chain_step_start', { agentId, agentName: agent.name, fromAgent: messageData.fromAgent || null });

        // S04 Pattern F: Write processing status (external messages only — no status for internal chain hops)
        const statusEnabled = !isInternal && settings.processing_status_enabled !== false; // default: true
        if (statusEnabled) {
            writeStatus({
                messageId,
                agentId,
                agentName: agent.name,
                channel,
                sender,
                chatId: messageData.senderId || sender,
                status: 'invoking_agent',
                startedAt: Date.now(),
            });
        }

        let response: string;
        try {
            response = await invokeAgent(agent, agentId, message, workspacePath, shouldReset, agents, teams);
        } catch (error) {
            const provider = agent.provider || 'anthropic';
            log('ERROR', `${provider === 'openai' ? 'Codex' : 'Claude'} error (agent: ${agentId}): ${(error as Error).message}`);
            response = "Sorry, I encountered an error processing your request. Please check the queue logs.";
        } finally {
            // S04 Pattern F: Always clear status after agent finishes (success or error)
            if (statusEnabled) clearStatus(messageId);
        }

        emitEvent('chain_step_done', { agentId, agentName: agent.name, responseLength: response.length, responseText: response });

        // --- No team context: simple response to user ---
        if (!teamContext) {
            let finalResponse = response.trim();

            // Detect files
            const outboundFilesSet = new Set<string>();
            collectFiles(finalResponse, outboundFilesSet);
            const outboundFiles = Array.from(outboundFilesSet);
            if (outboundFiles.length > 0) {
                finalResponse = finalResponse.replace(/\[send_file:\s*[^\]]+\]/g, '').trim();
            }

            // Handle long responses — send as file attachment
            const { message: responseMessage, files: allFiles } = handleLongResponse(finalResponse, outboundFiles);

            const responseData: ResponseData = {
                channel,
                sender,
                senderId: messageData.senderId,
                message: responseMessage,
                originalMessage: rawMessage,
                timestamp: Date.now(),
                messageId,
                agent: agentId,
                files: allFiles.length > 0 ? allFiles : undefined,
            };

            const responseFile = channel === 'heartbeat'
                ? path.join(QUEUE_OUTGOING, `${messageId}.json`)
                : path.join(QUEUE_OUTGOING, `${channel}_${messageId}_${Date.now()}.json`);

            fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));

            log('INFO', `✓ Response ready [${channel}] ${sender} via agent:${agentId} (${finalResponse.length} chars)`);
            emitEvent('response_ready', { channel, sender, agentId, responseLength: finalResponse.length, responseText: finalResponse, messageId });

            fs.unlinkSync(processingFile);
            return;
        }

        // --- Team context: conversation-based message passing ---

        // Get or create conversation
        let conv: Conversation;
        if (isInternal && messageData.conversationId && conversations.has(messageData.conversationId)) {
            conv = conversations.get(messageData.conversationId)!;
        } else {
            // New conversation — CTO-2026-002 Constraint 6.4: Snapshot config at conversation-start
            const convId = `${messageId}_${Date.now()}`;
            const correlationId = crypto.randomUUID();
            conv = {
                id: convId,
                channel,
                sender,
                senderId: messageData.senderId,
                originalMessage: rawMessage,
                messageId,
                pending: 1, // this initial message
                responses: [],
                files: new Set(),
                totalMessages: 0,
                maxMessages: MAX_CONVERSATION_MESSAGES,
                teamContext,
                startTime: Date.now(),
                outgoingMentions: new Map(),
                agentsInChain: new Set<string>(),
                configSnapshot: settings,      // Constraint 6.4: freeze config for conversation lifetime
                correlation_id: correlationId, // ACTION 5: correlation tracking
            };
            conversations.set(convId, conv);
            // Propagate correlation_id to the originating message data
            messageData.correlation_id = correlationId;
            messageData.delegation_depth = messageData.delegation_depth || 0;
            log('INFO', `Conversation started: ${convId} (team: ${teamContext.team.name}, correlation: ${correlationId})`);
            emitEvent('team_chain_start', { teamId: teamContext.teamId, teamName: teamContext.team.name, agents: teamContext.team.agents, leader: teamContext.team.leader_agent });
        }

        // Record this agent's response and track participation
        conv.responses.push({ agentId, response });
        conv.totalMessages++;
        conv.agentsInChain.add(agentId);
        collectFiles(response, conv.files);

        // Check for agent/team mentions (supports cross-team routing in v1.1.0)
        const teammateMentions = extractTeammateMentions(
            response, agentId, conv.teamContext.teamId, teams, agents, conv.agentsInChain
        );

        // CTO-2026-002 ACTION 5: Check delegation depth before enqueuing
        const currentDepth = messageData.delegation_depth || 0;
        const maxDepth = agent.max_delegation_depth ?? DEFAULT_MAX_DELEGATION_DEPTH;

        if (teammateMentions.length > 0 && currentDepth >= maxDepth) {
            log('WARN', `[DELEGATION] Agent ${agentId} at depth ${currentDepth} (max: ${maxDepth}) — blocking further delegation`);
        } else if (teammateMentions.length > 0 && conv.totalMessages < conv.maxMessages) {
            // Enqueue internal messages for each mention
            conv.pending += teammateMentions.length;
            conv.outgoingMentions.set(agentId, teammateMentions.length);
            for (const mention of teammateMentions) {
                const targetTeam = findTeamForAgent(mention.teammateId, teams);
                const isCrossTeam = targetTeam && targetTeam.teamId !== conv.teamContext.teamId;
                const tag = isCrossTeam ? '[CROSS-TEAM] ' : '';
                const teamInfo = isCrossTeam ? ` (${conv.teamContext.teamId} → ${targetTeam.teamId})` : '';
                log('INFO', `${tag}@${agentId} → @${mention.teammateId}${teamInfo} (depth: ${currentDepth + 1})`);
                emitEvent('chain_handoff', { teamId: conv.teamContext.teamId, fromAgent: agentId, toAgent: mention.teammateId, crossTeam: !!isCrossTeam });

                const internalMsg = `[Message from teammate @${agentId}]:\n${mention.message}`;
                enqueueInternalMessage(conv.id, agentId, mention.teammateId, internalMsg, messageData);
            }
        } else if (teammateMentions.length > 0) {
            log('WARN', `Conversation ${conv.id} hit max messages (${conv.maxMessages}) — not enqueuing further mentions`);
        }

        // This branch is done
        conv.pending--;

        if (conv.pending === 0) {
            completeConversation(conv);
        } else {
            log('INFO', `Conversation ${conv.id}: ${conv.pending} branch(es) still pending`);
        }

        // Clean up processing file
        fs.unlinkSync(processingFile);

    } catch (error) {
        const errMsg = (error as Error).message || '';
        log('ERROR', `Processing error: ${errMsg}`);

        if (fs.existsSync(processingFile)) {
            // Non-retryable errors (corrupt JSON, parse failures): discard to prevent infinite retry loop
            const isParseError = errMsg.includes('JSON') || errMsg.includes('Unexpected token') || errMsg.includes('Bad control character');
            if (isParseError) {
                log('WARN', `Discarding corrupt message file: ${path.basename(processingFile)}`);
                try { fs.unlinkSync(processingFile); } catch (e) { /* ignore */ }
            } else {
                // Retryable errors (agent timeout, network): move back to incoming for retry
                try {
                    fs.renameSync(processingFile, messageFile);
                } catch (e) {
                    log('ERROR', `Failed to move file back: ${(e as Error).message}`);
                }
            }
        }
    }
}

// Per-agent processing chains - ensures messages to same agent are sequential
const agentProcessingChains = new Map<string, Promise<void>>();

/**
 * Peek at a message file to determine which agent it's routed to.
 * Also resolves team IDs to their leader agent.
 */
function peekAgentId(filePath: string): string {
    try {
        const messageData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const settings = getSettings();
        const agents = getAgents(settings);
        const teams = getTeams(settings);

        // Check for pre-routed agent
        if (messageData.agent && agents[messageData.agent]) {
            return messageData.agent;
        }

        // Parse @agent_id or @team_id prefix
        const routing = parseAgentRouting(messageData.message || '', agents, teams);
        return routing.agentId || 'default';
    } catch {
        return 'default';
    }
}

// Main processing loop
async function processQueue(): Promise<void> {
    try {
        // Get all files from incoming queue, sorted by timestamp
        const files: QueueFile[] = fs.readdirSync(QUEUE_INCOMING)
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: path.join(QUEUE_INCOMING, f),
                time: fs.statSync(path.join(QUEUE_INCOMING, f)).mtimeMs
            }))
            .sort((a, b) => a.time - b.time);

        if (files.length > 0) {
            log('DEBUG', `Found ${files.length} message(s) in queue`);

            // Process messages in parallel by agent (sequential within each agent)
            for (const file of files) {
                // Skip files already queued in a promise chain
                if (queuedFiles.has(file.name)) continue;
                queuedFiles.add(file.name);

                // Determine target agent
                const agentId = peekAgentId(file.path);

                // Get or create promise chain for this agent
                const currentChain = agentProcessingChains.get(agentId) || Promise.resolve();

                // Chain this message to the agent's promise
                const newChain = currentChain
                    .then(() => processMessage(file.path))
                    .catch(error => {
                        log('ERROR', `Error processing message for agent ${agentId}: ${error.message}`);
                    })
                    .finally(() => {
                        queuedFiles.delete(file.name);
                    });

                // Update the chain
                agentProcessingChains.set(agentId, newChain);

                // Clean up completed chains to avoid memory leaks
                newChain.finally(() => {
                    if (agentProcessingChains.get(agentId) === newChain) {
                        agentProcessingChains.delete(agentId);
                    }
                });
            }
        }
    } catch (error) {
        log('ERROR', `Queue processing error: ${(error as Error).message}`);
    }
}

// Log agent and team configuration on startup
function logAgentConfig(): void {
    const settings = getSettings();
    const agents = getAgents(settings);
    const teams = getTeams(settings);

    const agentCount = Object.keys(agents).length;
    log('INFO', `Loaded ${agentCount} agent(s):`);
    for (const [id, agent] of Object.entries(agents)) {
        log('INFO', `  ${id}: ${agent.name} [${agent.provider}/${agent.model}] cwd=${agent.working_directory}`);
    }

    const teamCount = Object.keys(teams).length;
    if (teamCount > 0) {
        log('INFO', `Loaded ${teamCount} team(s):`);
        for (const [id, team] of Object.entries(teams)) {
            log('INFO', `  ${id}: ${team.name} [agents: ${team.agents.join(', ')}] leader=${team.leader_agent}`);
        }
    }
}

// Ensure events dir exists
if (!fs.existsSync(EVENTS_DIR)) {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
}

// --- Channel Plugin Bridge ---

/**
 * Write an incoming plugin message to the file-based queue.
 * chatId (thread ID) is stored in senderId so responses can be delivered back.
 */
function writeMessageToIncoming(msg: IncomingChannelMessage): void {
    if (!msg.chatId?.trim()) {
        log('WARN', `[plugin:${msg.channelId}] dropped message — missing chatId`);
        return;
    }
    const messageId = crypto.randomUUID();
    const sender = ((msg.senderName || msg.senderId || '').trim()) || 'unknown';
    const messageData: MessageData = {
        channel: msg.channelId,
        sender,
        senderId: msg.chatId.trim(),   // chatId = thread ID — used for reply delivery
        message: msg.content || '',
        timestamp: msg.timestamp || Date.now(),
        messageId,
    };
    const filename = `${msg.channelId}_${messageData.timestamp}_${messageId}.json`;
    const filePath = path.join(QUEUE_INCOMING, filename);
    fs.writeFileSync(filePath, JSON.stringify(messageData, null, 2));
    log('DEBUG', `[plugin:${msg.channelId}] queued message from ${msg.senderId}`);
}

/**
 * Instantiate and register channel plugins based on settings.channels.enabled.
 * Currently supports: zalo (Zalo OA), zalouser (Zalo Personal via zca-cli).
 */
function initPlugins(): void {
    const settings = getSettings();
    const enabled: string[] = settings?.channels?.enabled ?? [];

    if (enabled.includes('zalouser')) {
        const cfg = settings?.channels?.zalouser ?? {};
        const plugin = new ZaloUserPlugin({ filesDir: FILES_DIR, ...cfg });
        plugin.onMessage((msg) => writeMessageToIncoming(msg));
        plugin.onReady?.(() => log('INFO', '[zalouser] Zalo Personal connected'));
        plugin.onError?.((err) => log('WARN', `[zalouser] ${err.message}`));
        pluginLoader.register(plugin);
        log('INFO', '[zalouser] Zalo Personal plugin registered');
    }

    if (enabled.includes('zalo')) {
        const cfg = settings?.channels?.zalo ?? {};
        if (!cfg.token) {
            log('WARN', '[zalo] Skipping Zalo OA — missing channels.zalo.token in settings');
        } else {
            const plugin = new ZaloPlugin({ token: cfg.token, filesDir: FILES_DIR, apiBaseUrl: cfg.apiBaseUrl });
            plugin.onMessage((msg) => writeMessageToIncoming(msg));
            plugin.onReady?.(() => log('INFO', '[zalo] Zalo OA connected'));
            plugin.onError?.((err) => log('WARN', `[zalo] ${err.message}`));
            pluginLoader.register(plugin);
            log('INFO', '[zalo] Zalo OA plugin registered');
        }
    }
}

// Guards for shutdown and concurrent delivery loop
let pluginShutdown = false;
let pluginDelivering = false;

/**
 * Poll outgoing queue for plugin-channel responses and deliver via sendMessage().
 * Only processes files whose channel matches a registered plugin — legacy channel
 * clients (bash processes) handle the rest.
 *
 * File is deleted AFTER successful delivery to allow retry on sendMessage failure.
 */
async function deliverPluginResponses(): Promise<void> {
    if (pluginShutdown || pluginDelivering) return;
    pluginDelivering = true;
    try {
        const files = fs.readdirSync(QUEUE_OUTGOING).filter(f => f.endsWith('.json'));
        for (const file of files) {
            if (pluginShutdown) break;
            const filePath = path.join(QUEUE_OUTGOING, file);
            let data: ResponseData;
            try {
                data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch {
                continue;
            }

            const plugin = pluginLoader.get(data.channel);
            if (!plugin) continue; // not a plugin channel — leave for legacy client

            const chatId = data.senderId || data.sender;
            try {
                await plugin.sendMessage(chatId, data.message);
                // Delete AFTER successful delivery — retains file for retry on failure
                try { fs.unlinkSync(filePath); } catch { /* already gone */ }
                log('INFO', `[plugin:${data.channel}] delivered to ${chatId} (${data.message.length} chars)`);
            } catch (err) {
                log('ERROR', `[plugin:${data.channel}] sendMessage failed: ${(err as Error).message}`);
                // File retained — will retry on next tick
            }
        }
    } catch (err) {
        log('ERROR', `deliverPluginResponses error: ${(err as Error).message}`);
    } finally {
        pluginDelivering = false;
    }
}

// Main loop
log('INFO', 'Queue processor started');
recoverOrphanedFiles();
log('INFO', `Watching: ${QUEUE_INCOMING}`);
logAgentConfig();
emitEvent('processor_start', { agents: Object.keys(getAgents(getSettings())), teams: Object.keys(getTeams(getSettings())) });

// Process queue every 1 second
const processQueueTimer = setInterval(processQueue, 1000);

// Initialize and connect channel plugins (zalo, zalouser)
initPlugins();
const enabledChannels: string[] = getSettings()?.channels?.enabled ?? [];
pluginLoader.connectEnabled(enabledChannels).catch(err => {
    log('ERROR', `Plugin connect failed: ${(err as Error).message}`);
});

// Deliver plugin responses every 1 second
const deliverPluginTimer = setInterval(deliverPluginResponses, 1000);

// Graceful shutdown
function gracefulShutdown(): void {
    log('INFO', 'Shutting down queue processor...');
    pluginShutdown = true;
    clearInterval(processQueueTimer);
    clearInterval(deliverPluginTimer);
    pluginLoader.disconnectAll().finally(() => process.exit(0));
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
