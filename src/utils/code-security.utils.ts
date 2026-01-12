/**
 * Code Security Utilities
 * 
 * Provides validation and sanitization for user-provided code
 * to prevent code injection and malicious execution.
 */

/**
 * Dangerous patterns that should never be allowed in user code
 */
export const DANGEROUS_PATTERN = /[;{}]|`|\$\{|\/\/|\/\*|\*\/|\\x|\\u/;

/**
 * Disallowed keywords that could enable malicious operations
 * Case-insensitive to catch all variations
 */
export const DISALLOWED_KEYWORDS = /\b(eval|Function|require|import|export|class|new|this|window|document|global|process|constructor|prototype|__proto__|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__|arguments|yield|async|await)\b/i;

/**
 * Maximum length for user-provided code expressions
 */
export const MAX_CODE_LENGTH = 10000;

/**
 * Validate user-provided code for security issues
 * 
 * @param code - Code string to validate
 * @throws Error if code contains dangerous patterns
 */
export function validateUserCode(code: string): void {
    if (!code || typeof code !== 'string') {
        throw new Error('Code must be a non-empty string');
    }

    if (code.length > MAX_CODE_LENGTH) {
        throw new Error(`Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`);
    }

    // Check for dangerous patterns
    if (DANGEROUS_PATTERN.test(code)) {
        throw new Error('Code contains disallowed patterns (semicolons, braces, backticks, template literals, comments, or escape sequences)');
    }

    // Check for disallowed keywords
    if (DISALLOWED_KEYWORDS.test(code)) {
        throw new Error('Code contains disallowed keywords (eval, Function, require, import, class, etc.)');
    }
}

/**
 * Validate a condition expression (used in conditional transformers)
 * Stricter validation for simple expressions
 * 
 * @param condition - Condition expression to validate
 * @throws Error if condition is invalid
 */
export function validateConditionExpression(condition: string): void {
    if (!condition || typeof condition !== 'string') {
        throw new Error('Condition must be a non-empty string');
    }

    if (condition.length > 1000) {
        throw new Error('Condition exceeds maximum length of 1000 characters');
    }

    // Check for dangerous patterns
    if (DANGEROUS_PATTERN.test(condition)) {
        throw new Error('Condition contains disallowed patterns');
    }

    // Check for disallowed keywords
    if (DISALLOWED_KEYWORDS.test(condition)) {
        throw new Error('Condition contains disallowed keywords');
    }

    // Validate that it only contains safe expression characters
    const safeExpressionPattern = /^[a-zA-Z0-9_$. \t\n\r+\-*/%&|!?:=<>()[\],'"]*$/;
    if (!safeExpressionPattern.test(condition)) {
        throw new Error('Condition contains invalid characters');
    }
}

/**
 * Sanitize code by removing potential dangerous constructs
 * This is a fallback - validation should be preferred
 * 
 * @param code - Code to sanitize
 * @returns Sanitized code
 * @deprecated Use validateUserCode() instead
 */
export function sanitizeCode(code: string): string {
    // Remove line comments
    let sanitized = code.replace(/\/\/.*$/gm, '');
    
    // Remove block comments
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remove trailing semicolons
    sanitized = sanitized.replace(/;+$/, '');
    
    return sanitized.trim();
}

/**
 * Create a sandbox for executing user code
 * Provides a restricted environment with limited globals
 * 
 * @param additionalGlobals - Additional globals to add to sandbox
 * @returns Sandboxed globals object
 */
export function createCodeSandbox(additionalGlobals: Record<string, any> = {}): Record<string, any> {
    return {
        // Safe built-in objects
        Array,
        Object,
        String,
        Number,
        Boolean,
        Math,
        Date,
        JSON,
        RegExp,
        Map,
        Set,
        isArray: Array.isArray,
        keys: Object.keys,
        values: Object.values,
        entries: Object.entries,

        // Safe utilities
        isNaN,
        isFinite,
        parseFloat,
        parseInt,
        encodeURI,
        decodeURI,
        encodeURIComponent,
        decodeURIComponent,
        btoa,
        atob,
        
        // Additional globals (for records, context, etc.)
        ...additionalGlobals,
    };
}
