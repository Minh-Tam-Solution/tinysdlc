/**
 * FailoverError Classification — CTO-2026-002 ACTION 4 (P1)
 *
 * Classifies provider errors into 6 categories with defined actions:
 *   auth       → ABORT (credential issue)
 *   billing    → ABORT (payment issue)
 *   rate_limit → FALLBACK to next provider
 *   timeout    → FALLBACK to next provider
 *   format     → RETRY 1x with same provider
 *   unknown    → ABORT + log for investigation
 */

export type FailoverReason = 'auth' | 'format' | 'rate_limit' | 'billing' | 'timeout' | 'unknown';

export interface FailoverError {
    reason: FailoverReason;
    provider: string;
    statusCode?: number;
    message: string;
    retryable: boolean;
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
    if (status === 408 || /timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(msg)) {
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
