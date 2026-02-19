import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function expandTilde(p: string): string {
    return p.startsWith('~/') || p === '~' ? os.homedir() + p.slice(1) : p;
}

/**
 * SEC-003: Validate that a resolved path stays within one of the allowed base directories.
 * Prevents path traversal attacks via crafted working_directory / project_directory values.
 * Returns the resolved path if safe, or null if the path escapes the allowed boundary.
 */
function validatePath(resolved: string, ...allowedBases: string[]): string | null {
    for (const base of allowedBases) {
        const normalizedBase = path.resolve(base);
        if (resolved === normalizedBase || resolved.startsWith(normalizedBase + path.sep)) {
            return resolved;
        }
    }
    return null;
}
import { AgentConfig, TeamConfig } from './types';
import { SCRIPT_DIR, resolveClaudeModel, resolveCodexModel, resolveOllamaModel, getSettings, getActiveProject } from './config';
import { log } from './logging';
import { ensureAgentDirectory, updateAgentTeammates } from './agent-setup';
import { fullGuard } from './shell-guard';
import { classifyError, shouldFallback, shouldRetry } from './failover';
import { scrubEnv } from './env-scrubber';

const DEFAULT_AGENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function runCommand(command: string, args: string[], cwd?: string, stdinData?: string, timeoutMs: number = DEFAULT_AGENT_TIMEOUT_MS): Promise<string> {
    return new Promise((resolve, reject) => {
        // S04 Pattern C: Scrub sensitive env vars before spawning AI CLI child processes
        // Always-on — PRESERVE_LIST in env-scrubber.ts is the escape hatch
        const { env, removedKeys } = scrubEnv(process.env);
        if (removedKeys.length > 0) {
            log('DEBUG', `[ENV-SCRUB] Removed ${removedKeys.length} sensitive var(s) from child process env`);
        }

        const child = spawn(command, args, {
            cwd: cwd || SCRIPT_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            env,
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill('SIGKILL');
            reject(new Error(`Agent timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');

        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });

        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
        });

        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });

        child.on('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (code === 0) {
                resolve(stdout);
                return;
            }

            const errorMessage = stderr.trim() || `Command exited with code ${code}`;
            reject(new Error(errorMessage));
        });

        if (stdinData !== undefined) {
            child.stdin!.write(stdinData);
        }
        child.stdin!.end();
    });
}

/**
 * Invoke a single agent with a message. Contains all Claude/Codex invocation logic.
 * Returns the raw response text.
 */
export async function invokeAgent(
    agent: AgentConfig,
    agentId: string,
    message: string,
    workspacePath: string,
    shouldReset: boolean,
    agents: Record<string, AgentConfig> = {},
    teams: Record<string, TeamConfig> = {}
): Promise<string> {
    // Ensure agent directory exists with config files
    const agentDir = path.join(workspacePath, agentId);
    const isNewAgent = !fs.existsSync(agentDir);
    ensureAgentDirectory(agentDir, agent);
    if (isNewAgent) {
        log('INFO', `Initialized agent directory with config files: ${agentDir}`);
    }

    // Update AGENTS.md with current teammate info
    updateAgentTeammates(agentDir, agentId, agents, teams);

    // Resolve working directory — SEC-003: validate path stays within homedir or workspacePath
    // S03: active_project overrides per-agent working_directory
    const activeProject = getActiveProject(getSettings());
    const rawWorkingDir = activeProject
        ? expandTilde(activeProject.path)
        : (agent.working_directory ? expandTilde(agent.working_directory) : '');
    const candidateWorkingDir = rawWorkingDir
        ? (path.isAbsolute(rawWorkingDir) ? rawWorkingDir : path.join(workspacePath, rawWorkingDir))
        : agentDir;
    const safeWorkingDir = validatePath(path.resolve(candidateWorkingDir), workspacePath, os.homedir());
    if (!safeWorkingDir) {
        log('ERROR', `[SEC] working_directory blocked — path escapes allowed boundary: ${rawWorkingDir}`);
        throw new Error(`Agent ${agentId}: working_directory is outside allowed path boundary`);
    }
    const workingDir = safeWorkingDir;

    // --- SDLC v6.1.0: System prompt injection ---
    // Write system prompt to SYSTEM_CONTEXT.md in agent's working dir (picked up via CLAUDE.md context)
    const promptFile = agent.prompt_file
        ? (expandTilde(agent.prompt_file))
        : null;
    const resolvedPromptFile = promptFile
        ? (path.isAbsolute(promptFile) ? promptFile : path.join(workingDir, promptFile))
        : null;
    const promptContent = agent.system_prompt
        ?? (resolvedPromptFile && fs.existsSync(resolvedPromptFile) ? fs.readFileSync(resolvedPromptFile, 'utf8') : undefined);
    if (promptContent) {
        const contextPath = path.join(workingDir, 'SYSTEM_CONTEXT.md');
        fs.writeFileSync(contextPath, promptContent);
    }

    // --- SDLC v6.1.0: Inject project_directory context ---
    // If agent has a shared project_directory, prepend project path context to message
    let effectiveMessage = message;
    if (agent.project_directory) {
        const rawProjDir = expandTilde(agent.project_directory);
        const candidateProjDir = path.resolve(
            path.isAbsolute(rawProjDir) ? rawProjDir : path.join(workspacePath, rawProjDir)
        );
        // SEC-003: validate project_directory stays within workspace or homedir
        const safeProjDir = validatePath(candidateProjDir, workspacePath, os.homedir());
        if (!safeProjDir) {
            log('WARN', `[SEC] project_directory blocked — path escapes allowed boundary: ${rawProjDir}`);
        } else if (fs.existsSync(safeProjDir)) {
            effectiveMessage = `[Project Directory: ${safeProjDir}]\n\n${message}`;
        }
    }

    const provider = agent.provider || 'anthropic';

    if (provider === 'ollama') {
        // --- Ollama (local models) — HTTP, shell guard not applicable ---
        log('INFO', `Using Ollama provider (agent: ${agentId})`);
        const modelId = resolveOllamaModel(agent.model);
        const ollamaUrl = process.env.OLLAMA_URL || getSettings()?.providers?.ollama?.url || 'http://localhost:11434';

        try {
            const response = await fetch(`${ollamaUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: 'user', content: effectiveMessage }],
                    stream: false,
                }),
            });

            if (!response.ok) {
                const err = { status: response.status, message: `Ollama API error: ${response.status} ${response.statusText}` };
                const classified = classifyError(err, 'ollama');
                log('ERROR', `Ollama error classified: ${JSON.stringify({ reason: classified.reason, retryable: classified.retryable, agent_id: agentId })}`);
                throw new Error(err.message);
            }

            const data = await response.json() as { message?: { content?: string } };
            return data?.message?.content || 'Sorry, I could not generate a response from Ollama.';
        } catch (err) {
            const classified = classifyError(err, 'ollama');
            log('ERROR', `Ollama invocation failed: ${JSON.stringify({ reason: classified.reason, provider: classified.provider, statusCode: classified.statusCode, retryable: classified.retryable, agent_id: agentId })}`);
            throw err;
        }
    } else if (provider === 'openai') {
        // --- Codex CLI: shell guard applies ---
        log('INFO', `Using Codex CLI (agent: ${agentId})`);

        // CTO-2026-002 ACTION 1: Shell safety guard (CLI spawn path)
        const shellGuardEnabled = agent.shell_guard_enabled !== false; // default: true
        if (shellGuardEnabled) {
            const guardResult = fullGuard(effectiveMessage, workingDir);
            if (!guardResult.allowed) {
                log('WARN', `[SHELL-GUARD] Blocked command for agent ${agentId}: ${guardResult.reason}`);
                return `Shell guard blocked this request: ${guardResult.reason}`;
            }
        }

        if (shouldReset) {
            log('INFO', `🔄 Resetting Codex conversation for agent: ${agentId}`);
        }

        const modelId = resolveCodexModel(agent.model);
        const codexArgs = ['exec'];
        if (modelId) {
            codexArgs.push('--model', modelId);
        }
        codexArgs.push('--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '--json');
        codexArgs.push(effectiveMessage);

        try {
            const rawOutput = await runCommand('codex', codexArgs, workingDir);

            // Parse JSONL output and extract final agent_message
            let response = '';
            const lines = rawOutput.trim().split('\n');
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'item.completed' && json.item?.type === 'agent_message') {
                        response = json.item.text;
                    }
                } catch (e) {
                    // Ignore lines that aren't valid JSON
                }
            }

            return response || 'Sorry, I could not generate a response from Codex.';
        } catch (err) {
            const classified = classifyError(err, 'openai');
            log('ERROR', `Codex error classified: ${JSON.stringify({ reason: classified.reason, provider: classified.provider, statusCode: classified.statusCode, retryable: classified.retryable, agent_id: agentId })}`);

            // ACTION 4: Retry once for format errors
            if (shouldRetry(classified)) {
                log('INFO', `Retrying Codex invocation for agent ${agentId} (reason: ${classified.reason})`);
                try {
                    const retryOutput = await runCommand('codex', codexArgs, workingDir);
                    let response = '';
                    const lines = retryOutput.trim().split('\n');
                    for (const line of lines) {
                        try {
                            const json = JSON.parse(line);
                            if (json.type === 'item.completed' && json.item?.type === 'agent_message') {
                                response = json.item.text;
                            }
                        } catch (e) { /* ignore */ }
                    }
                    return response || 'Sorry, I could not generate a response from Codex.';
                } catch (retryErr) {
                    log('ERROR', `Codex retry also failed for agent ${agentId}: ${(retryErr as Error).message}`);
                }
            }

            if (shouldFallback(classified)) {
                log('INFO', `Fallback recommended for agent ${agentId} (reason: ${classified.reason}). Fallback chain wiring deferred to P2.`);
            }

            throw err;
        }
    } else {
        // --- Claude (Anthropic): shell guard applies ---
        log('INFO', `Using Claude provider (agent: ${agentId})`);

        // CTO-2026-002 ACTION 1: Shell safety guard (CLI spawn path)
        const shellGuardEnabled = agent.shell_guard_enabled !== false; // default: true
        if (shellGuardEnabled) {
            const guardResult = fullGuard(effectiveMessage, workingDir);
            if (!guardResult.allowed) {
                log('WARN', `[SHELL-GUARD] Blocked command for agent ${agentId}: ${guardResult.reason}`);
                return `Shell guard blocked this request: ${guardResult.reason}`;
            }
        }

        const continueConversation = !shouldReset;

        if (shouldReset) {
            log('INFO', `🔄 Resetting conversation for agent: ${agentId}`);
        }

        const modelId = resolveClaudeModel(agent.model);
        const claudeArgs = ['--dangerously-skip-permissions'];
        if (modelId) {
            claudeArgs.push('--model', modelId);
        }
        if (continueConversation) {
            claudeArgs.push('-c');
        }
        claudeArgs.push('-p', effectiveMessage);

        try {
            return await runCommand('claude', claudeArgs, workingDir);
        } catch (err) {
            const classified = classifyError(err, 'anthropic');
            log('ERROR', `Claude error classified: ${JSON.stringify({ reason: classified.reason, provider: classified.provider, statusCode: classified.statusCode, retryable: classified.retryable, agent_id: agentId })}`);

            // ACTION 4: Retry once for format errors
            if (shouldRetry(classified)) {
                log('INFO', `Retrying Claude invocation for agent ${agentId} (reason: ${classified.reason})`);
                try {
                    return await runCommand('claude', claudeArgs, workingDir);
                } catch (retryErr) {
                    log('ERROR', `Claude retry also failed for agent ${agentId}: ${(retryErr as Error).message}`);
                }
            }

            if (shouldFallback(classified)) {
                log('INFO', `Fallback recommended for agent ${agentId} (reason: ${classified.reason}). Fallback chain wiring deferred to P2.`);
            }

            throw err;
        }
    }
}
