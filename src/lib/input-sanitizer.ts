/**
 * Input Sanitization — ADR-056 Non-Negotiable #4 (P0)
 *
 * Sanitize user input from OTT channels before injection into agent context.
 * Strips 12 known prompt injection patterns (from OpenClaw src/security/external-content.ts).
 *
 * ADR-056 specifies:
 *   - System prompt override: (ignore|forget|disregard) (previous|above|all) (instructions|prompts)
 *   - Role injection: you are (now|a)
 *   - Delimiter escape: (```|<|im_sep|>|<|system|>)
 *   - Base64 payload: base64[:\s]
 */

const INJECTION_PATTERNS: { pattern: RegExp; description: string }[] = [
    // System prompt override attempts (ADR-056 pattern 1-4)
    { pattern: /<\/?system>/gi, description: 'system tag injection' },
    { pattern: /\[SYSTEM\]/gi, description: 'system bracket injection' },
    { pattern: /<<\s*SYS\s*>>/gi, description: 'llama-style system injection' },
    { pattern: /\[INST\]/gi, description: 'instruction tag injection' },

    // Role-switching / instruction override (ADR-056 pattern 5-8)
    { pattern: /(ignore|forget|disregard)\s+(previous|above|all)\s+(instructions|prompts)/gi, description: 'instruction override' },
    { pattern: /you\s+are\s+(now|a)\s+/gi, description: 'role injection' },
    { pattern: /act\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:a\s+)?(?:different|new)\s+(?:ai|assistant|system)/gi, description: 'role impersonation' },
    { pattern: /pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:different|unrestricted)/gi, description: 'pretend override' },

    // Delimiter escape (ADR-056 pattern 9-10)
    { pattern: /<\|im_sep\|>|<\|system\|>/gi, description: 'chat-ml delimiter injection' },
    { pattern: /###\s*(?:SYSTEM|INSTRUCTION|ADMIN)\s*###/gi, description: 'header injection' },

    // Delimiter injection — breaking out of user message context (ADR-056 pattern 11)
    { pattern: /\n-{3,}\s*(?:system|assistant|human)\s*\n/gi, description: 'role delimiter injection' },

    // Base64 payload detection (ADR-056 pattern 12)
    { pattern: /base64[:\s]/gi, description: 'base64 payload' },
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
