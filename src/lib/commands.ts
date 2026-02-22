/**
 * Shared Command Handler — S03 Workspace Command
 *
 * Consolidates all in-chat command logic (/agent, /team, /reset, /workspace)
 * into a single module. Invoked from queue-processor.ts so ALL channels
 * (legacy + plugin) benefit without per-channel modifications (CTO OBS-1).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Settings, AgentConfig, TeamConfig, ProjectConfig } from './types';
import { getSettings, getAgents, getTeams, getActiveProject, writeSettings, expandTilde, resolveSprintFile, SETTINGS_FILE } from './config';

export interface CommandResult {
    response: string;
}

/**
 * Try to handle a message as an in-chat command.
 * Returns CommandResult if it was a command, null if it should be queued normally.
 * Only processes external (non-internal) messages.
 */
export function handleCommand(messageText: string, workspacePath: string): CommandResult | null {
    const text = messageText.trim();

    // /agent — list agents
    if (text.match(/^[!/]agent$/i)) {
        return { response: getAgentListText() };
    }

    // /team — list teams
    if (text.match(/^[!/]team$/i)) {
        return { response: getTeamListText() };
    }

    // /reset (no args) — usage hint
    if (text.match(/^[!/]reset$/i)) {
        return { response: 'Usage: /reset @agent_id [@agent_id2 ...]\nSpecify which agent(s) to reset.' };
    }

    // /reset @agent_id [@agent_id2 ...]
    const resetMatch = text.match(/^[!/]reset\s+(.+)$/i);
    if (resetMatch) {
        return handleResetCommand(resetMatch[1], workspacePath);
    }

    // /workspace commands
    const wsResult = handleWorkspaceCommand(text, workspacePath);
    if (wsResult) return wsResult;

    // /sprint commands
    const sprintResult = handleSprintCommand(text, workspacePath);
    if (sprintResult) return sprintResult;

    return null;
}

// --- Agent list ---

function getAgentListText(): string {
    try {
        const settings = getSettings();
        const agents = settings.agents;
        if (!agents || Object.keys(agents).length === 0) {
            return 'No agents configured. Using default single-agent mode.\n\nConfigure agents in .tinysdlc/settings.json or run: tinysdlc agent add';
        }

        const activeProject = getActiveProject(settings);
        let text = 'Available Agents:\n';
        for (const [id, agent] of Object.entries(agents)) {
            text += `\n@${id} - ${agent.name}`;
            text += `\n  Provider: ${agent.provider}/${agent.model}`;
            if ((agent as AgentConfig).sdlc_role) text += `\n  Role: ${(agent as AgentConfig).sdlc_role}`;
        }
        text += '\n\nUsage: Start your message with @agent_id to route to a specific agent.';
        if (activeProject) {
            text += `\n\nActive project: ${activeProject.alias} (${activeProject.name})`;
        }
        return text;
    } catch {
        return 'Could not load agent configuration.';
    }
}

// --- Team list ---

function getTeamListText(): string {
    try {
        const settings = getSettings();
        const teams = settings.teams;
        if (!teams || Object.keys(teams).length === 0) {
            return 'No teams configured.\n\nCreate a team with: tinysdlc team add';
        }
        let text = 'Available Teams:\n';
        for (const [id, team] of Object.entries(teams)) {
            text += `\n@${id} - ${(team as TeamConfig).name}`;
            text += `\n  Agents: ${(team as TeamConfig).agents.join(', ')}`;
            text += `\n  Leader: @${(team as TeamConfig).leader_agent}`;
        }
        text += '\n\nUsage: Start your message with @team_id to route to a team.';
        return text;
    } catch {
        return 'Could not load team configuration.';
    }
}

// --- Reset command ---

function handleResetCommand(argsStr: string, workspacePath: string): CommandResult {
    try {
        const settings = getSettings();
        const agents = settings.agents || {};
        const resolvedWorkspace = expandTilde(workspacePath);
        const agentArgs = argsStr.split(/\s+/).map(a => a.replace(/^@/, '').toLowerCase());
        const results: string[] = [];

        for (const agentId of agentArgs) {
            if (!agents[agentId]) {
                results.push(`Agent '${agentId}' not found.`);
                continue;
            }
            const flagDir = path.join(resolvedWorkspace, agentId);
            if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true });
            fs.writeFileSync(path.join(flagDir, 'reset_flag'), 'reset');
            results.push(`Reset @${agentId} (${(agents[agentId] as AgentConfig).name}).`);
        }

        return { response: results.join('\n') };
    } catch {
        return { response: 'Could not process reset command. Check settings.' };
    }
}

// --- Workspace commands ---

function handleWorkspaceCommand(text: string, workspacePath: string): CommandResult | null {
    // /workspace — show status
    if (text.match(/^[!/]workspace$/i)) {
        return showWorkspaceStatus();
    }

    // /workspace list
    if (text.match(/^[!/]workspace\s+list$/i)) {
        return showWorkspaceStatus();
    }

    // /workspace add <alias> <path> [--external]
    const addMatch = text.match(/^[!/]workspace\s+add\s+(\S+)\s+(.+)$/i);
    if (addMatch) {
        const rawArgs = addMatch[2].trim();
        const allowExternal = /\s+--external\s*$/i.test(rawArgs);
        const cleanPath = rawArgs.replace(/\s+--external\s*$/i, '').trim();
        return addProject(addMatch[1], cleanPath, allowExternal);
    }

    // /workspace set <alias>
    const setMatch = text.match(/^[!/]workspace\s+set\s+(\S+)$/i);
    if (setMatch) {
        return setActiveProject(setMatch[1], workspacePath);
    }

    // /workspace remove <alias>
    const removeMatch = text.match(/^[!/]workspace\s+remove\s+(\S+)$/i);
    if (removeMatch) {
        return removeProject(removeMatch[1]);
    }

    // /workspace with unknown subcommand — show help
    if (text.match(/^[!/]workspace\s/i)) {
        return {
            response: [
                'Workspace Commands:',
                '',
                '/workspace — Show current project',
                '/workspace list — List projects',
                '/workspace add <alias> <path> [--external] — Register project',
                '/workspace set <alias> — Switch project',
                '/workspace remove <alias> — Unregister project',
            ].join('\n'),
        };
    }

    return null;
}

function showWorkspaceStatus(): CommandResult {
    const settings = getSettings();
    const projects = settings.projects || {};
    const activeAlias = settings.active_project;

    if (Object.keys(projects).length === 0) {
        return {
            response: [
                'No projects registered.',
                '',
                'Register a project:',
                '/workspace add <alias> <path>',
                '',
                'Example:',
                '/workspace add myapp ~/repos/my-app',
            ].join('\n'),
        };
    }

    const lines: string[] = [];

    if (activeAlias && projects[activeAlias]) {
        const p = projects[activeAlias];
        lines.push(`Active project: ${activeAlias} (${p.name})`);
        lines.push(`Path: ${p.path}`);
        lines.push('');
    } else {
        lines.push('No active project set.');
        lines.push('');
    }

    lines.push('Registered projects:');
    for (const [alias, project] of Object.entries(projects)) {
        const active = alias === activeAlias ? ' [ACTIVE]' : '';
        lines.push(`  ${alias} — ${(project as ProjectConfig).name} (${(project as ProjectConfig).path})${active}`);
    }

    return { response: lines.join('\n') };
}

function addProject(alias: string, rawPath: string, allowExternal: boolean = false): CommandResult {
    // Validate alias format
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(alias)) {
        return { response: 'Project alias must be alphanumeric with hyphens (e.g., my-project).' };
    }

    // Normalize alias to lowercase
    const normalizedAlias = alias.toLowerCase();

    // Resolve path
    const resolvedPath = path.resolve(expandTilde(rawPath));

    // Must exist and be a directory
    if (!fs.existsSync(resolvedPath)) {
        return { response: `Path does not exist: ${resolvedPath}` };
    }
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
        return { response: `Path is not a directory: ${resolvedPath}` };
    }

    // SEC-003: Path validation
    const realPath = fs.realpathSync(resolvedPath);
    const homedir = os.homedir();
    const inHome = realPath === homedir || realPath.startsWith(homedir + path.sep);

    if (!inHome && !allowExternal) {
        return {
            response: [
                `Path is outside your home directory: ${realPath}`,
                '',
                'To allow external paths, add --external:',
                `/workspace add ${alias} ${rawPath} --external`,
            ].join('\n'),
        };
    }

    // Check for duplicate alias
    const settings = getSettings();
    const projects = settings.projects || {};
    if (projects[normalizedAlias]) {
        return { response: `Project '${normalizedAlias}' already registered. Remove it first with /workspace remove ${normalizedAlias}` };
    }

    // Save
    projects[normalizedAlias] = { name: alias, path: realPath };
    writeSettings({ projects });

    return { response: `Registered project '${normalizedAlias}' at ${realPath}` };
}

function setActiveProject(alias: string, workspacePath: string): CommandResult {
    const normalizedAlias = alias.toLowerCase();
    const settings = getSettings();
    const projects = settings.projects || {};

    if (!projects[normalizedAlias]) {
        const available = Object.keys(projects);
        if (available.length === 0) {
            return { response: `No projects registered. Use /workspace add <alias> <path> first.` };
        }
        return { response: `Project '${normalizedAlias}' not found.\n\nAvailable: ${available.join(', ')}` };
    }

    const project = projects[normalizedAlias] as ProjectConfig;

    // Verify path still exists
    if (!fs.existsSync(expandTilde(project.path))) {
        return { response: `Project path no longer exists: ${project.path}\nRemove with /workspace remove ${normalizedAlias}` };
    }

    // Update active project
    writeSettings({ active_project: normalizedAlias });

    // Reset all agent conversations
    const agents = settings.agents || {};
    const resolvedWorkspace = expandTilde(workspacePath);
    const resetAgents: string[] = [];
    for (const agentId of Object.keys(agents)) {
        const flagDir = path.join(resolvedWorkspace, agentId);
        if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true });
        fs.writeFileSync(path.join(flagDir, 'reset_flag'), 'reset');
        resetAgents.push(agentId);
    }

    const resetMsg = resetAgents.length > 0
        ? `\nAll agent conversations reset (${resetAgents.map(a => '@' + a).join(', ')}).`
        : '';

    return {
        response: `Switched to project '${normalizedAlias}' (${project.name})\nPath: ${project.path}${resetMsg}`,
    };
}

function removeProject(alias: string): CommandResult {
    const normalizedAlias = alias.toLowerCase();
    const settings = getSettings();
    const projects = settings.projects || {};

    if (!projects[normalizedAlias]) {
        return { response: `Project '${normalizedAlias}' not found.` };
    }

    // Cannot remove active project
    if (settings.active_project === normalizedAlias) {
        return { response: `Cannot remove active project '${normalizedAlias}'. Switch to another project first with /workspace set <alias>.` };
    }

    delete projects[normalizedAlias];
    writeSettings({ projects });

    return { response: `Removed project '${normalizedAlias}' from registry.` };
}

// --- Sprint commands (S05) ---

function handleSprintCommand(text: string, workspacePath: string): CommandResult | null {
    // /sprint — show current sprint info
    if (text.match(/^[!/]sprint$/i)) {
        return showSprintInfo(workspacePath);
    }

    // /sprint status — show full status with deliverables
    if (text.match(/^[!/]sprint\s+status$/i)) {
        return showSprintStatus(workspacePath);
    }

    // /sprint set <number> <goal>
    const setMatch = text.match(/^[!/]sprint\s+set\s+(\S+)\s+(.+)$/i);
    if (setMatch) {
        return setSprintInfo(workspacePath, setMatch[1], setMatch[2]);
    }

    // /sprint with unknown subcommand — show help
    if (text.match(/^[!/]sprint\s/i)) {
        return {
            response: [
                'Sprint Commands:',
                '',
                '/sprint -- Show current sprint info',
                '/sprint status -- Show deliverables and agent status',
                '/sprint set <number> <goal> -- Update sprint number and goal',
            ].join('\n'),
        };
    }

    return null;
}

function getSprintFilePath(workspacePath: string): string | null {
    const settings = getSettings();
    return resolveSprintFile(settings, workspacePath);
}

function showSprintInfo(workspacePath: string): CommandResult {
    const sprintFile = getSprintFilePath(workspacePath);
    if (!sprintFile) {
        return {
            response: 'No CURRENT-SPRINT.md found.\n\nCreate one with: tinysdlc sdlc init\nOr place CURRENT-SPRINT.md in your project/workspace directory.',
        };
    }

    const content = fs.readFileSync(sprintFile, 'utf8');
    // Extract header fields
    const sprintMatch = content.match(/\*\*Sprint\*\*:\s*(.+)/);
    const goalMatch = content.match(/\*\*Goal\*\*:\s*(.+)/);
    const statusMatch = content.match(/\*\*Status\*\*:\s*(.+)/);
    const startMatch = content.match(/\*\*Start\*\*:\s*(.+)/);
    const endMatch = content.match(/\*\*End\*\*:\s*(.+)/);

    const lines = [
        `Sprint: ${sprintMatch?.[1] || '(not set)'}`,
        `Goal: ${goalMatch?.[1] || '(not set)'}`,
        `Status: ${statusMatch?.[1] || 'PLANNED'}`,
        `Start: ${startMatch?.[1] || '-'}`,
        `End: ${endMatch?.[1] || '-'}`,
        '',
        `File: ${sprintFile}`,
    ];

    return { response: lines.join('\n') };
}

function showSprintStatus(workspacePath: string): CommandResult {
    const sprintFile = getSprintFilePath(workspacePath);
    if (!sprintFile) {
        return {
            response: 'No CURRENT-SPRINT.md found.\n\nCreate one with: tinysdlc sdlc init',
        };
    }

    const content = fs.readFileSync(sprintFile, 'utf8');
    // Return first 50 lines (same cap as context injection)
    const lines = content.split('\n').slice(0, 50);
    return { response: lines.join('\n') };
}

function setSprintInfo(workspacePath: string, sprintNumber: string, goal: string): CommandResult {
    const sprintFile = getSprintFilePath(workspacePath);
    if (!sprintFile) {
        return {
            response: 'No CURRENT-SPRINT.md found.\n\nCreate one with: tinysdlc sdlc init',
        };
    }

    let content = fs.readFileSync(sprintFile, 'utf8');

    // Update Sprint field
    content = content.replace(/(\*\*Sprint\*\*:\s*).+/, `$1${sprintNumber}`);
    // Update Goal field
    content = content.replace(/(\*\*Goal\*\*:\s*).+/, `$1${goal}`);
    // Update Status to IN_PROGRESS
    content = content.replace(/(\*\*Status\*\*:\s*).+/, `$1IN_PROGRESS`);
    // Update Start date
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    content = content.replace(/(\*\*Start\*\*:\s*).+/, `$1${dateStr}`);

    fs.writeFileSync(sprintFile, content);

    return {
        response: `Sprint updated:\n  Sprint: ${sprintNumber}\n  Goal: ${goal}\n  Status: IN_PROGRESS\n  Start: ${dateStr}`,
    };
}
