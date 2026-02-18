export interface AgentConfig {
    name: string;
    provider: string;       // 'anthropic', 'openai', or 'ollama'
    model: string;           // e.g. 'sonnet', 'opus', 'gpt-5.3-codex', 'llama3.2'
    working_directory: string;
    // SDLC Framework v6.0.6 fields (optional, backward compatible)
    sdlc_role?: SdlcRole;        // enforced by TypeScript at compile time
    system_prompt?: string;      // Inline system prompt prepended via SYSTEM_CONTEXT.md
    prompt_file?: string;        // Path to .md file used as system prompt
    project_directory?: string;  // Shared project dir for team members
    // CTO-2026-002 Ecosystem Upgrade fields
    shell_guard_enabled?: boolean;       // ACTION 1: Enable shell safety guards (default: true)
    max_delegation_depth?: number;       // ACTION 5: Max delegation depth (default: 1)
    fallback_providers?: string[];       // ACTION 4: Fallback provider chain (wiring P2, type now)
}

export interface ProjectConfig {
    name: string;    // Human-readable project name
    path: string;    // Absolute path to project directory
}

export interface TeamConfig {
    name: string;
    agents: string[];
    leader_agent: string;
    description?: string;        // Human-readable purpose (SDLC stage coverage)
}

export interface ChainStep {
    agentId: string;
    response: string;
}

export interface Settings {
    workspace?: {
        path?: string;
        name?: string;
    };
    channels?: {
        enabled?: string[];
        discord?: { bot_token?: string };
        telegram?: { bot_token?: string };
        whatsapp?: {};
    };
    models?: {
        provider?: string; // 'anthropic' or 'openai'
        anthropic?: {
            model?: string;
        };
        openai?: {
            model?: string;
        };
    };
    agents?: Record<string, AgentConfig>;
    teams?: Record<string, TeamConfig>;
    monitoring?: {
        heartbeat_interval?: number;
    };
    providers?: {
        ollama?: { url?: string };  // e.g. 'https://api.nhatquangholding.com'
    };
    // CTO-2026-002 ACTION 2: Orchestrator integration (gated, off by default)
    orchestrator_integration?: {
        enabled: boolean;
        endpoint?: string;
    };
    // CTO-2026-002 Constraint 6.5: Input sanitization toggle
    input_sanitization_enabled?: boolean;  // default: true
    // S03: Project workspace switching
    projects?: Record<string, ProjectConfig>;  // Project registry (alias → config)
    active_project?: string;                   // Key into projects registry
}

export interface MessageData {
    channel: string;
    sender: string;
    senderId?: string;
    message: string;
    timestamp: number;
    messageId: string;
    agent?: string; // optional: pre-routed agent id from channel client
    files?: string[];
    // Internal message fields (agent-to-agent)
    conversationId?: string; // links to parent conversation
    fromAgent?: string;      // which agent sent this internal message
    // CTO-2026-002 ACTION 5: Delegation tracking
    delegation_depth?: number;   // current depth in delegation chain (default: 0)
    correlation_id?: string;     // UUID linking all messages in a delegation chain
}

export interface Conversation {
    id: string;
    channel: string;
    sender: string;
    senderId?: string; // persisted for delivery after restart
    originalMessage: string;
    messageId: string;
    pending: number;
    responses: ChainStep[];
    files: Set<string>;
    totalMessages: number;
    maxMessages: number;
    teamContext: { teamId: string; team: TeamConfig };
    startTime: number;
    // Track how many mentions each agent sent out (for inbox draining)
    outgoingMentions: Map<string, number>;
    // CTO-2026-002 Constraint 6.4: Config snapshot for conversation lifetime
    configSnapshot?: Settings;
    // CTO-2026-002 ACTION 5: Correlation tracking
    correlation_id?: string;
}

export interface ResponseData {
    channel: string;
    sender: string;
    senderId?: string; // persisted so response can be delivered after restart
    message: string;
    originalMessage: string;
    timestamp: number;
    messageId: string;
    agent?: string; // which agent handled this
    files?: string[];
}

export interface QueueFile {
    name: string;
    path: string;
    time: number;
}

// Model name mapping
export const CLAUDE_MODEL_IDS: Record<string, string> = {
    'sonnet': 'claude-sonnet-4-5',
    'opus': 'claude-opus-4-6',
    'claude-sonnet-4-5': 'claude-sonnet-4-5',
    'claude-opus-4-6': 'claude-opus-4-6'
};

export const CODEX_MODEL_IDS: Record<string, string> = {
    'gpt-5.1': 'gpt-5.1',
    'gpt-5.2': 'gpt-5.2',
    'gpt-5.3-codex': 'gpt-5.3-codex',
};

// Ollama uses model names directly — this maps friendly aliases
export const OLLAMA_MODEL_IDS: Record<string, string> = {
    'llama3.2': 'llama3.2',
    'llama3.1': 'llama3.1',
    'qwen3': 'qwen3',
    'qwen3-coder': 'qwen3-coder:30b',
    'codellama': 'codellama',
    'deepseek-coder-v2': 'deepseek-coder-v2',
};

// Valid SDLC roles for Framework v6.0.6
export const SDLC_ROLES = ['researcher', 'pm', 'pjm', 'architect', 'coder', 'reviewer', 'tester', 'devops'] as const;
export type SdlcRole = typeof SDLC_ROLES[number];
