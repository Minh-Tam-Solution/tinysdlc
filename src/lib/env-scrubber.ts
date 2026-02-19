/**
 * Environment Scrubbing — Pattern C (S04 ZeroClaw)
 *
 * Remove sensitive environment variables from AI CLI child processes
 * before spawning. Uses a deny-list approach with an explicit PRESERVE_LIST
 * as the escape hatch.
 *
 * ADR-009: Always-on (no config toggle). PRESERVE_LIST is the escape hatch.
 * CTO fix: Provider auth keys explicitly in PRESERVE_LIST — without these,
 * all Claude CLI / Codex CLI invocations fail with authentication errors.
 */

/** Exact variable names to remove from child process environments (O(1) Set lookup) */
const SENSITIVE_EXACT: Set<string> = new Set([
    // Version control hosting tokens
    'GITHUB_TOKEN', 'GH_TOKEN', 'GITLAB_TOKEN', 'BITBUCKET_TOKEN',
    // Database / data store
    'DATABASE_URL', 'DB_PASSWORD', 'DB_PASS', 'MONGO_URL', 'REDIS_URL',
    // Cloud provider credentials
    'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
    'AZURE_CLIENT_SECRET', 'AZURE_STORAGE_KEY', 'AZURE_TENANT_ID',
    'GOOGLE_APPLICATION_CREDENTIALS', 'GCP_SERVICE_ACCOUNT_KEY',
    // CI/CD tokens
    'CIRCLE_TOKEN', 'TRAVIS_TOKEN', 'JENKINS_API_TOKEN',
    // Notification services
    'SLACK_TOKEN', 'SLACK_WEBHOOK_URL',
    'DISCORD_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN',
    // Package registries
    'NPM_TOKEN', 'PYPI_TOKEN', 'CARGO_REGISTRY_TOKEN',
    // Generic secret names
    'SECRET_KEY', 'PRIVATE_KEY', 'JWT_SECRET',
    // Docker
    'DOCKER_PASSWORD', 'REGISTRY_PASSWORD',
    // SSH
    'SSH_AUTH_SOCK',
]);

/** Suffix patterns to match vars like MY_SERVICE_TOKEN, PROD_DB_PASSWORD, etc. */
const SENSITIVE_PATTERNS: RegExp[] = [
    /_SECRET$/i,
    /_TOKEN$/i,
    /_PASSWORD$/i,
    /_PASS$/i,
    /_API_KEY$/i,
    /_PRIVATE_KEY$/i,
    /_CREDENTIAL$/i,
    /_CREDENTIALS$/i,
];

/**
 * Variables that MUST survive into agent subprocesses.
 *
 * CTO fix (applied): Provider auth keys explicitly preserved — Claude CLI and
 * Codex CLI require these for authentication. Without ANTHROPIC_API_KEY, all
 * `claude` invocations fail immediately.
 *
 * To add more exceptions: add key names here. This is the intentional escape hatch.
 */
const PRESERVE_LIST: Set<string> = new Set([
    // System runtime
    'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'TZ',
    'LOGNAME', 'PWD', 'OLDPWD',
    // Node.js
    'NODE_ENV', 'NODE_PATH', 'NODE_OPTIONS',
    // TinySDLC runtime
    'TINYSDLC_HOME', 'WHATSAPP_ALLOW_SELF',
    // Provider auth keys — CRITICAL (CTO fix): agent CLIs need these for authentication
    'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY',
    // Ollama (local AI inference)
    'OLLAMA_URL',
    // Network proxy
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'no_proxy',
    // Display / session (needed for some CLIs)
    'DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR',
]);

export interface ScrubEnvResult {
    env: NodeJS.ProcessEnv;
    removedKeys: string[];
}

/**
 * Remove sensitive env vars from a copy of the process environment.
 *
 * Always-on — no config toggle. PRESERVE_LIST is the escape hatch.
 * If a tool or CLI needs an env var that gets scrubbed, add it to PRESERVE_LIST.
 *
 * @param sourceEnv - Environment object to scrub (typically process.env)
 * @returns Scrubbed environment copy and list of removed key names
 */
export function scrubEnv(sourceEnv: NodeJS.ProcessEnv): ScrubEnvResult {
    const env: NodeJS.ProcessEnv = { ...sourceEnv };
    const removedKeys: string[] = [];

    for (const key of Object.keys(env)) {
        // Preserved variables are never removed
        if (PRESERVE_LIST.has(key)) continue;

        // Check exact deny-list matches (O(1) Set lookup)
        if (SENSITIVE_EXACT.has(key)) {
            delete env[key];
            removedKeys.push(key);
            continue;
        }

        // Check suffix pattern matches
        if (SENSITIVE_PATTERNS.some(p => p.test(key))) {
            delete env[key];
            removedKeys.push(key);
        }
    }

    return { env, removedKeys };
}
