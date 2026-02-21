export interface AgentConfig {
    name: string;
    provider: string;       // 'anthropic', 'openai', or 'ollama'
    model: string;           // e.g. 'sonnet', 'opus', 'gpt-5.3-codex', 'llama3.2'
    working_directory: string;
    // MTS-SDLC-Lite (SDLC 6.1.0) fields (optional, backward compatible)
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
        zalo?: { token?: string; apiBaseUrl?: string };
        zalouser?: { zcaPath?: string; profile?: string };
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
    // CTO-2026-002 Constraint 6.5: Input sanitization toggle
    input_sanitization_enabled?: boolean;  // default: true
    // S03: Project workspace switching
    projects?: Record<string, ProjectConfig>;  // Project registry (alias → config)
    active_project?: string;                   // Key into projects registry
    // S04: ZeroClaw security + UX patterns
    credential_scrubbing_enabled?: boolean;    // Pattern A: scrub credentials from OTT input (default: true)
    processing_status_enabled?: boolean;       // Pattern F: show progress feedback in channels (default: true)
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
    // Track all agents who participated in this conversation (circular detection, v1.1.0)
    agentsInChain: Set<string>;
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

// Valid SDLC roles for MTS-SDLC-Lite (SDLC 6.1.0) — 12-Role SASE Classification
// SE4A (Agent Executors): 8 roles — active at LITE tier
export const SE4A_ROLES = ['researcher', 'pm', 'pjm', 'architect', 'coder', 'reviewer', 'tester', 'devops'] as const;
// SE4H (Human Advisors): 3 roles — active at STANDARD+ tier
export const SE4H_ROLES = ['ceo', 'cpo', 'cto'] as const;
// Router: 1 role — active at STANDARD+ tier
export const ROUTER_ROLES = ['assistant'] as const;
// All 12 SDLC roles
export const SDLC_ROLES = [...SE4A_ROLES, ...SE4H_ROLES, ...ROUTER_ROLES] as const;
export type SdlcRole = typeof SDLC_ROLES[number];
