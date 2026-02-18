import path from 'path';

/**
 * Shell Safety Guards — ADR-056 Non-Negotiable #5 + Section 10.2 (P0)
 *
 * 8 mandatory deny patterns (cannot be removed, can add more).
 * Guards CLI spawn paths (Claude, Codex) only. Ollama uses HTTP — not applicable.
 * Output truncation at 10KB per ADR-056.
 */

const MAX_OUTPUT_SIZE = 10 * 1024; // 10KB per ADR-056 Section 10.2

const DENY_PATTERNS: { pattern: RegExp; description: string }[] = [
    { pattern: /rm\s+(-[rf]+\s+)*\//, description: 'recursive delete' },
    { pattern: /:\(\)\{.*\|.*&\s*\};\s*/, description: 'fork bomb' },
    { pattern: /(shutdown|reboot|halt|poweroff)/, description: 'system control' },
    { pattern: /(mkfs|fdisk|dd\s+if=)/, description: 'disk operations' },
    { pattern: />\s*\/dev\/sd/, description: 'raw disk write' },
    { pattern: /chmod\s+(-R\s+)?777/, description: 'unsafe permissions' },
    { pattern: /curl.*\|\s*(bash|sh)/, description: 'pipe to shell' },
    { pattern: /eval\s*\(/, description: 'eval injection' },
];

export interface GuardResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Check if a command string is safe to execute.
 * Returns { allowed: true } or { allowed: false, reason: '...' }.
 */
export function guardCommand(command: string): GuardResult {
    for (const { pattern, description } of DENY_PATTERNS) {
        if (pattern.test(command)) {
            return { allowed: false, reason: `Blocked: ${description} (pattern: ${pattern.source})` };
        }
    }
    return { allowed: true };
}

/**
 * Check if a command references paths that escape the given workspace directory.
 * Returns true if the path stays within the workspace, false if it escapes.
 */
export function isWithinWorkspace(command: string, workspacePath: string): boolean {
    // Extract path-like tokens from command
    const tokens = command.split(/\s+/);
    const resolvedWorkspace = path.resolve(workspacePath);

    for (const token of tokens) {
        // Only check tokens that look like paths (contain .. or start with /)
        if (token.includes('..') || token.startsWith('/')) {
            const resolved = path.resolve(workspacePath, token);
            if (!resolved.startsWith(resolvedWorkspace + path.sep) && resolved !== resolvedWorkspace) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Full guard check: deny patterns + path traversal.
 */
export function fullGuard(command: string, workspacePath?: string): GuardResult {
    // Check deny patterns first
    const patternResult = guardCommand(command);
    if (!patternResult.allowed) return patternResult;

    // Check path traversal if workspace is provided
    if (workspacePath && !isWithinWorkspace(command, workspacePath)) {
        return { allowed: false, reason: 'Path traversal outside workspace detected' };
    }

    return { allowed: true };
}

/**
 * Truncate command output to MAX_OUTPUT_SIZE (10KB) per ADR-056 Section 10.2.
 */
export function truncateOutput(output: string): string {
    if (output.length > MAX_OUTPUT_SIZE) {
        return output.slice(0, MAX_OUTPUT_SIZE) + `\n... truncated (${output.length} bytes total)`;
    }
    return output;
}
