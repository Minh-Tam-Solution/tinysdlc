/**
 * Credential Scrubbing — Pattern A (S04 ZeroClaw)
 *
 * Scan user messages from OTT channels for accidentally pasted credentials
 * before they reach AI agents. Replaces found credentials with [REDACTED]
 * placeholders. Logs credential types found (not the actual values).
 *
 * ADR-008: Separate module from input-sanitizer.ts — different concern
 * (accidental leakage vs. malicious injection).
 *
 * Pattern: follows input-sanitizer.ts (const array + pure function + typed result)
 */

const CREDENTIAL_PATTERNS: { pattern: RegExp; name: string; placeholder: string }[] = [
    // AWS access keys (AKIA prefix, 20-char alphanumeric key ID)
    { pattern: /\b(AKIA[0-9A-Z]{16})\b/g, name: 'AWS access key', placeholder: '[AWS_KEY_REDACTED]' },
    // Anthropic API keys (sk-ant- prefix — {16,} covers all real key formats without false positives)
    { pattern: /\bsk-ant-[A-Za-z0-9\-_]{16,}\b/g, name: 'Anthropic API key', placeholder: '[ANTHROPIC_KEY_REDACTED]' },
    // OpenAI project keys (sk-proj- prefix — {16,} threshold)
    { pattern: /\bsk-proj-[A-Za-z0-9\-_]{16,}\b/g, name: 'OpenAI project key', placeholder: '[OPENAI_KEY_REDACTED]' },
    // GitHub tokens (ghp_, gho_, ghs_, ghr_, github_pat_ prefixes)
    { pattern: /\b(ghp_|gho_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}\b/g, name: 'GitHub token', placeholder: '[GITHUB_TOKEN_REDACTED]' },
    // Slack tokens (xoxb-, xoxe-, xoxa-, xoxp- prefixes)
    { pattern: /\b(xoxb-|xoxe-|xoxa-|xoxp-)[A-Za-z0-9\-]{20,}\b/g, name: 'Slack token', placeholder: '[SLACK_TOKEN_REDACTED]' },
    // Generic API key assignments (api_key=VALUE, apikey: VALUE formats)
    { pattern: /\b(api[_\-]?key\s*[:=]\s*)([A-Za-z0-9\-_.]{16,})/gi, name: 'API key assignment', placeholder: '$1[API_KEY_REDACTED]' },
    // Bearer token header values
    { pattern: /(bearer\s+)([A-Za-z0-9\-_.~+/]{20,}={0,2})/gi, name: 'Bearer token', placeholder: '$1[BEARER_TOKEN_REDACTED]' },
    // Password fields in key=value or JSON formats
    { pattern: /("?password"?\s*[:=]\s*"?)([^"'\s,}{]{8,})("?)/gi, name: 'Password field', placeholder: '$1[PASSWORD_REDACTED]$3' },
    // Database connection strings (postgres://, mysql://, mongodb://, redis://)
    { pattern: /\b(postgres|mysql|mongodb|redis):\/\/[^\s"'<>]+/gi, name: 'Connection string', placeholder: '[CONNECTION_STRING_REDACTED]' },
    // PEM private key blocks
    { pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|DSA\s+)?PRIVATE KEY-----[\s\S]*?-----END\s+\S*\s*PRIVATE KEY-----/g, name: 'PEM private key', placeholder: '[PRIVATE_KEY_REDACTED]' },
    // Generic sk- keys (fallback — after specific sk-ant- and sk-proj- patterns above)
    // Note: may produce false positives on non-credential sk- strings; acceptable for community release
    { pattern: /\bsk-[A-Za-z0-9]{20,}\b/g, name: 'API secret key', placeholder: '[SECRET_KEY_REDACTED]' },
];

export interface ScrubResult {
    content: string;
    modified: boolean;
    credentialsFound: string[];
}

/**
 * Scrub credentials from user input before delivery to AI agents.
 * Returns the sanitized content and list of credential types detected (not values).
 *
 * Only call for external (OTT) messages — internal agent-to-agent messages
 * are already within the trust boundary and are exempt from scrubbing.
 */
export function scrubCredentials(input: string): ScrubResult {
    let content = input;
    const credentialsFound: string[] = [];

    for (const { pattern, name, placeholder } of CREDENTIAL_PATTERNS) {
        // Reset lastIndex before test() for global regexes
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
            credentialsFound.push(name);
            pattern.lastIndex = 0;
            content = content.replace(pattern, placeholder);
        }
        pattern.lastIndex = 0;
    }

    return {
        content,
        modified: credentialsFound.length > 0,
        credentialsFound,
    };
}
