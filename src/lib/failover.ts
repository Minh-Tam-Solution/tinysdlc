/**
 * FailoverError Classification — ADR-056 Decision 3 (P0)
 *
 * Classifies provider errors into 6 categories with defined actions (CTO-verified):
 *   auth       → ABORT — credential issue, won't resolve by retrying
 *   billing    → ABORT — payment issue, needs human intervention
 *   rate_limit → FALLBACK — transient, other providers likely available
 *   timeout    → FALLBACK — transient, other providers likely faster
 *   format     → RETRY 1x — likely prompt issue, not provider issue
 *   unknown    → ABORT — unclassifiable, needs human investigation
 *
 * Provider Profile Key format: {provider}:{account}:{region}:{model_family}
 *   e.g. "ollama:local:vietnam:qwen3-coder", "anthropic:team-alpha:us-east-1:claude-sonnet"
 */

export type FailoverReason = 'auth' | 'format' | 'rate_limit' | 'billing' | 'timeout' | 'unknown';

/** Maximum retries for format errors before aborting */
export const FORMAT_MAX_RETRIES = 1;

export interface FailoverError {
    reason: FailoverReason;
    provider: string;
    statusCode?: number;
    message: string;
    retryable: boolean;
}

/**
 * Build a provider profile key per ADR-056 Decision 3.
 * Format: {provider}:{account}:{region}:{model_family}
 */
export function buildProfileKey(provider: string, model: string, account: string = 'default', region: string = 'local'): string {
    return `${provider}:${account}:${region}:${model}`;
}

/**
 * Classify an error into a FailoverReason with action guidance.
 */
export function classifyError(error: any, provider: string): FailoverError {
    const status = error?.status || error?.statusCode;
    const msg = error?.message || String(error);

    if (status === 401 || status === 403) {
        return { reason: 'auth', provider, statusCode: status, message: msg, retryable: false };
    }
    if (status === 402) {
        return { reason: 'billing', provider, statusCode: status, message: msg, retryable: false };
    }
    if (status === 429) {
        return { reason: 'rate_limit', provider, statusCode: status, message: msg, retryable: true };
    }
    if (status === 408 || /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
        return { reason: 'timeout', provider, statusCode: status, message: msg, retryable: true };
    }
    if (status === 400) {
        return { reason: 'format', provider, statusCode: status, message: msg, retryable: true };
    }

    return { reason: 'unknown', provider, statusCode: status, message: msg, retryable: false };
}

/**
 * Determine if a classified error should trigger a provider fallback.
 */
export function shouldFallback(error: FailoverError): boolean {
    return error.reason === 'rate_limit' || error.reason === 'timeout';
}

/**
 * Determine if a classified error should trigger a same-provider retry.
 */
export function shouldRetry(error: FailoverError): boolean {
    return error.reason === 'format';
}
