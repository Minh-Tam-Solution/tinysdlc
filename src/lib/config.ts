import fs from 'fs';
import path from 'path';
import { jsonrepair } from 'jsonrepair';
import os from 'os';
import { Settings, AgentConfig, TeamConfig, CLAUDE_MODEL_IDS, CODEX_MODEL_IDS, OLLAMA_MODEL_IDS } from './types';

// CTO-2026-002 defaults
export const DEFAULT_MAX_DELEGATION_DEPTH = 1;
export const DEFAULT_SHELL_GUARD_ENABLED = true;
export const DEFAULT_INPUT_SANITIZATION_ENABLED = true;

export const SCRIPT_DIR = path.resolve(__dirname, '../..');
const _localTinysdlc = path.join(SCRIPT_DIR, '.tinysdlc');
export const TINYSDLC_HOME = process.env.TINYSDLC_HOME
    || (fs.existsSync(path.join(_localTinysdlc, 'settings.json'))
        ? _localTinysdlc
        : path.join(require('os').homedir(), '.tinysdlc'));
export const QUEUE_INCOMING = path.join(TINYSDLC_HOME, 'queue/incoming');
export const QUEUE_OUTGOING = path.join(TINYSDLC_HOME, 'queue/outgoing');
export const QUEUE_PROCESSING = path.join(TINYSDLC_HOME, 'queue/processing');
export const LOG_FILE = path.join(TINYSDLC_HOME, 'logs/queue.log');
export const SETTINGS_FILE = path.join(TINYSDLC_HOME, 'settings.json');
export const EVENTS_DIR = path.join(TINYSDLC_HOME, 'events');
export const CHATS_DIR = path.join(TINYSDLC_HOME, 'chats');
export const FILES_DIR = path.join(TINYSDLC_HOME, 'files');

export function getSettings(): Settings {
    try {
        const settingsData = fs.readFileSync(SETTINGS_FILE, 'utf8');
        let settings: Settings;

        try {
            settings = JSON.parse(settingsData);
        } catch (parseError) {
            // JSON is invalid — attempt auto-fix with jsonrepair
            console.error(`[WARN] settings.json contains invalid JSON: ${(parseError as Error).message}`);

            try {
                const repaired = jsonrepair(settingsData);
                settings = JSON.parse(repaired);

                // Write the fixed JSON back and create a backup
                const backupPath = SETTINGS_FILE + '.bak';
                fs.copyFileSync(SETTINGS_FILE, backupPath);
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
                console.error(`[WARN] Auto-fixed settings.json (backup: ${backupPath})`);
            } catch {
                console.error(`[ERROR] Could not auto-fix settings.json — returning empty config`);
                return {};
            }
        }

        // Auto-detect provider if not specified
        if (!settings?.models?.provider) {
            if (settings?.models?.openai) {
                if (!settings.models) settings.models = {};
                settings.models.provider = 'openai';
            } else if (settings?.models?.anthropic) {
                if (!settings.models) settings.models = {};
                settings.models.provider = 'anthropic';
            }
        }

        return settings;
    } catch {
        return {};
    }
}

/**
 * Build the default agent config from the legacy models section.
 * Used when no agents are configured, for backwards compatibility.
 */
export function getDefaultAgentFromModels(settings: Settings): AgentConfig {
    const provider = settings?.models?.provider || 'anthropic';
    let model = '';
    if (provider === 'openai') {
        model = settings?.models?.openai?.model || 'gpt-5.3-codex';
    } else {
        model = settings?.models?.anthropic?.model || 'sonnet';
    }

    // Get workspace path from settings or use default
    const workspacePath = settings?.workspace?.path || path.join(require('os').homedir(), 'tinysdlc-workspace');
    const defaultAgentDir = path.join(workspacePath, 'default');

    return {
        name: 'Default',
        provider,
        model,
        working_directory: defaultAgentDir,
    };
}

/**
 * Get all configured agents. Falls back to a single "default" agent
 * derived from the legacy models section if no agents are configured.
 */
export function getAgents(settings: Settings): Record<string, AgentConfig> {
    if (settings.agents && Object.keys(settings.agents).length > 0) {
        return settings.agents;
    }
    // Fall back to default agent from models section
    return { default: getDefaultAgentFromModels(settings) };
}

/**
 * Get all configured teams.
 */
export function getTeams(settings: Settings): Record<string, TeamConfig> {
    return settings.teams || {};
}

/**
 * Resolve the model ID for Claude (Anthropic).
 */
export function resolveClaudeModel(model: string): string {
    return CLAUDE_MODEL_IDS[model] || model || '';
}

/**
 * Resolve the model ID for Codex (OpenAI).
 */
export function resolveCodexModel(model: string): string {
    return CODEX_MODEL_IDS[model] || model || '';
}

/**
 * Resolve the model ID for Ollama (local).
 */
export function resolveOllamaModel(model: string): string {
    return OLLAMA_MODEL_IDS[model] || model || '';
}

/**
 * Expand ~ to home directory.
 */
export function expandTilde(p: string): string {
    return p.startsWith('~/') || p === '~' ? os.homedir() + p.slice(1) : p;
}

/**
 * Get the currently active project, or null if none set.
 */
export function getActiveProject(settings: Settings): { alias: string; name: string; path: string } | null {
    const alias = settings.active_project;
    if (!alias || !settings.projects?.[alias]) return null;
    const project = settings.projects[alias];
    return { alias, name: project.name, path: project.path };
}

/**
 * Resolve the path to CURRENT-SPRINT.md in the active project or workspace root.
 * Returns the file path if it exists, null otherwise.
 */
export function resolveSprintFile(settings: Settings, workspacePath: string): string | null {
    const activeProject = getActiveProject(settings);
    const baseDir = activeProject
        ? expandTilde(activeProject.path)
        : expandTilde(workspacePath);
    const sprintFile = path.join(baseDir, 'CURRENT-SPRINT.md');
    return fs.existsSync(sprintFile) ? sprintFile : null;
}

/**
 * Write settings to disk atomically (OBS-2: temp + renameSync).
 * Re-reads current settings before write to avoid stale overwrites.
 */
export function writeSettings(updates: Partial<Settings>): void {
    // Re-read current state to avoid overwriting concurrent changes
    const current = getSettings();
    const merged = { ...current, ...updates };

    const tmpFile = SETTINGS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(merged, null, 2) + '\n');

    // Backup existing
    if (fs.existsSync(SETTINGS_FILE)) {
        fs.copyFileSync(SETTINGS_FILE, SETTINGS_FILE + '.bak');
    }

    // Atomic rename
    fs.renameSync(tmpFile, SETTINGS_FILE);
}
