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
import { SCRIPT_DIR, resolveClaudeModel, resolveCodexModel, resolveOllamaModel, getSettings } from './config';
import { log } from './logging';
import { ensureAgentDirectory, updateAgentTeammates } from './agent-setup';

const DEFAULT_AGENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function runCommand(command: string, args: string[], cwd?: string, stdinData?: string, timeoutMs: number = DEFAULT_AGENT_TIMEOUT_MS): Promise<string> {
    return new Promise((resolve, reject) => {
        // Unset CLAUDECODE so Claude CLI can run outside a Claude Code session
        const env = { ...process.env };
        delete env['CLAUDECODE'];

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
    const rawWorkingDir = agent.working_directory ? expandTilde(agent.working_directory) : '';
    const candidateWorkingDir = rawWorkingDir
        ? (path.isAbsolute(rawWorkingDir) ? rawWorkingDir : path.join(workspacePath, rawWorkingDir))
        : agentDir;
    const safeWorkingDir = validatePath(path.resolve(candidateWorkingDir), workspacePath, os.homedir());
    if (!safeWorkingDir) {
        log('ERROR', `[SEC] working_directory blocked — path escapes allowed boundary: ${rawWorkingDir}`);
        throw new Error(`Agent ${agentId}: working_directory is outside allowed path boundary`);
    }
    const workingDir = safeWorkingDir;

    // --- SDLC v6.0.6: System prompt injection ---
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

    // --- SDLC v6.0.6: Inject project_directory context ---
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
        // --- Ollama (local models) ---
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
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as { message?: { content?: string } };
            return data?.message?.content || 'Sorry, I could not generate a response from Ollama.';
        } catch (err) {
            log('ERROR', `Ollama invocation failed: ${(err as Error).message}`);
            throw err;
        }
    } else if (provider === 'openai') {
        log('INFO', `Using Codex CLI (agent: ${agentId})`);

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
    } else {
        // Default to Claude (Anthropic)
        log('INFO', `Using Claude provider (agent: ${agentId})`);

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

        return await runCommand('claude', claudeArgs, workingDir);
    }
}
