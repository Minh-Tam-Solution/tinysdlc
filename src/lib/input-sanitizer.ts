/**
 * Input Sanitization — CTO-2026-002 Constraint 6.5
 *
 * Sanitize user input from OTT channels before injection into agent context.
 * Strips known prompt injection patterns while preserving normal user messages.
 */

const INJECTION_PATTERNS: { pattern: RegExp; description: string }[] = [
    // System prompt override attempts
    { pattern: /<\/?system>/gi, description: 'system tag injection' },
    { pattern: /\[SYSTEM\]/gi, description: 'system bracket injection' },
    { pattern: /<<\s*SYS\s*>>/gi, description: 'llama-style system injection' },
    { pattern: /\[INST\]/gi, description: 'instruction tag injection' },

    // Role-switching commands
    { pattern: /ignore\s+(all\s+)?previous\s+instructions/gi, description: 'instruction override' },
    { pattern: /forget\s+(all\s+)?previous\s+(instructions|context)/gi, description: 'context reset' },
    { pattern: /you\s+are\s+now\s+(?:a\s+)?(?:different|new|evil|malicious)/gi, description: 'role switch' },
    { pattern: /act\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:a\s+)?(?:different|new)\s+(?:ai|assistant|system)/gi, description: 'role impersonation' },
    { pattern: /pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:different|unrestricted)/gi, description: 'pretend override' },

    // Delimiter injection (trying to break out of user message context)
    { pattern: /\n-{3,}\s*(?:system|assistant|human)\s*\n/gi, description: 'delimiter injection' },
    { pattern: /###\s*(?:SYSTEM|INSTRUCTION|ADMIN)\s*###/gi, description: 'header injection' },
];

export interface SanitizeResult {
    content: string;
    modified: boolean;
    patternsMatched: string[];
}

/**
 * Sanitize user input by stripping known prompt injection patterns.
 * Returns the sanitized content and metadata about what was stripped.
 */
export function sanitize(input: string): SanitizeResult {
    let content = input;
    const patternsMatched: string[] = [];

    for (const { pattern, description } of INJECTION_PATTERNS) {
        if (pattern.test(content)) {
            patternsMatched.push(description);
            content = content.replace(pattern, '');
        }
    }

    // Clean up: collapse multiple blank lines left by removals
    if (patternsMatched.length > 0) {
        content = content.replace(/\n{3,}/g, '\n\n').trim();
    }

    return {
        content,
        modified: patternsMatched.length > 0,
        patternsMatched,
    };
}
