import path from 'path';

/**
 * Shell Safety Guards — CTO-2026-002 ACTION 1 (P0)
 *
 * 8 mandatory deny patterns (cannot be removed, can add more).
 * Guards CLI spawn paths (Claude, Codex) only. Ollama uses HTTP — not applicable.
 */

const DENY_PATTERNS: { pattern: RegExp; description: string }[] = [
    { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--no-preserve-root)/, description: 'rm -rf / destructive delete' },
    { pattern: /:\(\)\{.*\|.*&\s*\};\s*:/, description: 'fork bomb' },
    { pattern: /mkfs\./, description: 'format disk' },
    { pattern: /dd\s+if=.*of=\/dev\//, description: 'disk overwrite via dd' },
    { pattern: />\s*\/dev\/sd[a-z]/, description: 'direct device write' },
    { pattern: /shutdown|reboot|init\s+[06]/, description: 'system shutdown/reboot' },
    { pattern: /chmod\s+(-[a-zA-Z]*\s+)?[0-7]*777/, description: 'world-writable permissions' },
    { pattern: /curl.*\|\s*(ba)?sh/, description: 'pipe remote script to shell' },
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
