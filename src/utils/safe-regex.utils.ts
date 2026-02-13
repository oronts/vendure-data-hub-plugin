/**
 * Safe Regex Utilities - ReDoS Protection
 *
 * Validates and creates user-provided regex patterns with protection
 * against catastrophic backtracking (ReDoS attacks).
 */

const MAX_PATTERN_LENGTH = 256;

/** Nested quantifiers like (a+)+ or (a*)+ that cause exponential backtracking */
const NESTED_QUANTIFIER_PATTERN = /\([^)]*[+*][^)]*\)[+*{]/;

/** Adjacent quantifiers like a++, a*+, a{2}+ (possessive-like patterns that fail in JS) */
const ADJACENT_QUANTIFIER_PATTERN = /[+*}][+*]/;

interface SafeRegexResult {
    safe: boolean;
    reason?: string;
}

export function validateRegexSafety(pattern: string): SafeRegexResult {
    if (!pattern || typeof pattern !== 'string') {
        return { safe: false, reason: 'Pattern must be a non-empty string' };
    }
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return { safe: false, reason: `Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH}` };
    }

    try {
        new RegExp(pattern);
    } catch {
        return { safe: false, reason: 'Invalid regex syntax' };
    }

    if (NESTED_QUANTIFIER_PATTERN.test(pattern)) {
        return { safe: false, reason: 'Pattern contains nested quantifiers that may cause catastrophic backtracking' };
    }
    if (ADJACENT_QUANTIFIER_PATTERN.test(pattern)) {
        return { safe: false, reason: 'Pattern contains adjacent quantifiers that may cause catastrophic backtracking' };
    }

    return { safe: true };
}

/** Creates a RegExp only if the pattern passes safety validation. Throws on unsafe patterns. */
export function createSafeRegex(pattern: string, flags?: string): RegExp {
    const result = validateRegexSafety(pattern);
    if (!result.safe) {
        throw new Error(`Unsafe regex pattern: ${result.reason}`);
    }
    return new RegExp(pattern, flags);
}
