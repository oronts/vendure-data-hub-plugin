/**
 * Code Security Utilities
 *
 * Security validation for user-provided code expressions.
 * Uses defense-in-depth approach with multiple layers of protection.
 */

// Import directly from defaults to avoid circular dependency with constants/index.ts
// which imports ../operators -> script.operators.ts -> this file
import { CODE_SECURITY } from '../constants/defaults';

/**
 * Security configuration for code evaluation
 */
export interface CodeSecurityConfig {
    /** Maximum allowed code length in characters */
    maxCodeLength: number;
    /** Maximum allowed condition length in characters */
    maxConditionLength: number;
    /** Maximum expression complexity (nested depth + operator count) */
    maxExpressionComplexity: number;
    /** Maximum number of property accesses allowed */
    maxPropertyAccessDepth: number;
    /** Whether to allow array methods */
    allowArrayMethods: boolean;
    /** Whether to allow string methods */
    allowStringMethods: boolean;
}

/**
 * Default security configuration
 */
export const DEFAULT_CODE_SECURITY_CONFIG: CodeSecurityConfig = {
    maxCodeLength: CODE_SECURITY.MAX_CODE_LENGTH,
    maxConditionLength: CODE_SECURITY.MAX_CONDITION_LENGTH,
    maxExpressionComplexity: CODE_SECURITY.MAX_EXPRESSION_COMPLEXITY,
    maxPropertyAccessDepth: CODE_SECURITY.MAX_PROPERTY_ACCESS_DEPTH,
    allowArrayMethods: true,
    allowStringMethods: true,
};

/**
 * Dangerous patterns that indicate potential code injection
 * Uses multiple regex patterns for defense in depth
 */
export const DANGEROUS_PATTERNS = {
    /** Statement terminators and code blocks */
    STATEMENT_PATTERNS: /[;{}]|`|\$\{/,

    /** Comment patterns that could hide malicious code */
    COMMENT_PATTERNS: /\/\/|\/\*|\*\//,

    /** Escape sequences that could bypass validation */
    ESCAPE_SEQUENCES: /\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/,

    /** Unicode escape sequences in various forms (control characters, line/paragraph separators) */
    // Using character codes to avoid ESLint no-control-regex false positive
    UNICODE_ESCAPES: new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + '-' + String.fromCharCode(159) + String.fromCharCode(8232) + String.fromCharCode(8233) + ']'),

    /** Octal escape sequences */
    OCTAL_ESCAPES: /\\[0-7]{1,3}/,

    /** HTML/XML entities that could be used for obfuscation */
    HTML_ENTITIES: /&#x?[0-9a-fA-F]+;?/i,

    /** Base64 encoded content patterns */
    BASE64_PATTERNS: /atob\s*\(|btoa\s*\(/i,

    /** String concatenation tricks */
    STRING_CONCAT_TRICKS: /\[\s*['"][^'"]*['"]\s*\]\s*\(/,

    /** Bracket notation property access with computed values */
    COMPUTED_PROPERTY_ACCESS: /\[\s*(?:['"`][^'"`]*['"`]\s*\+|\+\s*['"`])/,
} as const;

/**
 * Keywords that should never appear in user code
 * Block list to prevent sandbox escape
 */
export const DISALLOWED_KEYWORDS = [
    // Function/code execution
    'eval',
    'Function',
    'AsyncFunction',
    'GeneratorFunction',
    'AsyncGeneratorFunction',

    // Module system
    'require',
    'import',
    'export',
    'module',
    'exports',

    // Object creation and classes
    'class',
    'new',
    'extends',

    // Context access
    'this',
    'self',
    'globalThis',

    // Browser globals
    'window',
    'document',
    'navigator',
    'location',
    'history',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
    'XMLHttpRequest',
    'WebSocket',

    // Node.js globals
    'global',
    'process',
    'Buffer',
    '__dirname',
    '__filename',

    // Prototype chain manipulation
    'constructor',
    'prototype',
    '__proto__',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    'getPrototypeOf',
    'setPrototypeOf',
    'defineProperty',
    'defineProperties',
    'getOwnPropertyDescriptor',
    'getOwnPropertyDescriptors',
    'getOwnPropertyNames',
    'getOwnPropertySymbols',

    // Reflection
    'Reflect',
    'Proxy',

    // Special objects
    'arguments',
    'caller',
    'callee',

    // Async patterns
    'yield',
    'async',
    'await',
    'Promise',

    // Code generation
    'with',
    'debugger',

    // Dangerous built-ins
    'setTimeout',
    'setInterval',
    'setImmediate',
    'clearTimeout',
    'clearInterval',
    'clearImmediate',
    'queueMicrotask',

    // Symbol access
    'Symbol',

    // WeakRef for potential memory attacks
    'WeakRef',
    'FinalizationRegistry',
] as const;

/**
 * Pattern to match disallowed keywords as whole words
 * Uses word boundaries to avoid false positives
 */
const DISALLOWED_KEYWORDS_PATTERN = new RegExp(
    `\\b(${DISALLOWED_KEYWORDS.join('|')})\\b`,
);

/**
 * Keywords allowed in script blocks but not in simple expressions.
 *
 * Script blocks run in an isolated VM context with sandboxed constructors
 * (SafeDate, String, Number, Boolean), so `new` is safe. `class` is safe
 * because it can only create local classes with no access to host prototypes.
 */
const SCRIPT_ALLOWED_KEYWORDS = new Set(['new', 'class', 'extends']);

/**
 * Disallowed keywords for script blocks — a subset of DISALLOWED_KEYWORDS
 * that excludes keywords safe in the sandboxed VM context.
 */
const SCRIPT_DISALLOWED_KEYWORDS = DISALLOWED_KEYWORDS.filter(
    k => !SCRIPT_ALLOWED_KEYWORDS.has(k),
);

const SCRIPT_DISALLOWED_KEYWORDS_PATTERN = new RegExp(
    `\\b(${SCRIPT_DISALLOWED_KEYWORDS.join('|')})\\b`,
);

/**
 * Prototype pollution attack patterns
 */
export const PROTOTYPE_POLLUTION_PATTERNS = [
    // Direct prototype access
    /__proto__/,
    /prototype\s*\[/,
    /\[\s*['"]prototype['"]\s*\]/,
    /\[\s*['"]__proto__['"]\s*\]/,

    // Constructor access
    /constructor\s*\[/,
    /\[\s*['"]constructor['"]\s*\]/,
    /\.constructor\s*\./,

    // Object.prototype manipulation
    /Object\s*\.\s*prototype/,
    /Array\s*\.\s*prototype/,
    /String\s*\.\s*prototype/,
    /Number\s*\.\s*prototype/,
    /Function\s*\.\s*prototype/,
] as const;

/**
 * Allowed safe characters pattern for simple expressions
 */
const SAFE_EXPRESSION_PATTERN = /^[a-zA-Z0-9_$.\s+\-*/%&|!?:=<>()[\],'"]*$/;

/**
 * Validates user code for security issues
 * Throws an error if any security concern is detected
 *
 * This is for SIMPLE EXPRESSIONS (condition evaluator, when operator, etc.)
 * For full script blocks (script operator), use validateScriptBlock() instead.
 */
export function validateUserCode(
    code: string,
    config: Partial<CodeSecurityConfig> = {},
): void {
    const mergedConfig = { ...DEFAULT_CODE_SECURITY_CONFIG, ...config };

    // Basic validation
    if (!code || typeof code !== 'string') {
        throw new Error('Code must be a non-empty string');
    }

    // Length check
    if (code.length > mergedConfig.maxCodeLength) {
        throw new Error(
            `Code exceeds maximum length of ${mergedConfig.maxCodeLength} characters`,
        );
    }

    // Normalize code for analysis (handle various whitespace)
    const normalizedCode = code.replace(/\s+/g, ' ').trim();

    // Check dangerous patterns
    checkDangerousPatterns(normalizedCode);

    // Check disallowed keywords
    checkDisallowedKeywords(normalizedCode);

    // Check prototype pollution
    checkPrototypePollution(normalizedCode);

    // Check expression complexity
    checkExpressionComplexity(normalizedCode, mergedConfig);
}

/**
 * Validates script blocks for security issues.
 *
 * Unlike validateUserCode() which is for simple expressions,
 * this allows semicolons, braces, and comments that are needed
 * for multi-line JavaScript code blocks (script operator).
 *
 * Security is still enforced via:
 * - Code length limits
 * - Disallowed keywords (eval, Function, require, import, process, etc.)
 * - Prototype pollution pattern detection
 * - Escape sequence / encoding attack detection
 * - The VM sandbox itself (isolated context, frozen globals, timeout)
 */
export function validateScriptBlock(
    code: string,
    config: Partial<CodeSecurityConfig> = {},
): void {
    const mergedConfig = { ...DEFAULT_CODE_SECURITY_CONFIG, ...config };

    if (!code || typeof code !== 'string') {
        throw new Error('Code must be a non-empty string');
    }

    if (code.length > mergedConfig.maxCodeLength) {
        throw new Error(
            `Code exceeds maximum length of ${mergedConfig.maxCodeLength} characters`,
        );
    }

    // Normalize code for analysis
    const normalizedCode = code.replace(/\s+/g, ' ').trim();

    // Check encoding/obfuscation patterns (but NOT statements/comments which are valid in scripts)
    checkScriptDangerousPatterns(normalizedCode);

    // Strip comments before keyword/pollution checks to avoid false positives
    // from words in comments (e.g. "// this constructor is safe")
    const codeWithoutComments = normalizedCode
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();

    checkScriptDisallowedKeywords(codeWithoutComments);
    checkPrototypePollution(codeWithoutComments);
}

/**
 * Validates condition expressions (more restrictive than general code)
 */
export function validateConditionExpression(
    condition: string,
    config: Partial<CodeSecurityConfig> = {},
): void {
    const mergedConfig = { ...DEFAULT_CODE_SECURITY_CONFIG, ...config };

    if (!condition || typeof condition !== 'string') {
        throw new Error('Condition must be a non-empty string');
    }

    if (condition.length > mergedConfig.maxConditionLength) {
        throw new Error(
            `Condition exceeds maximum length of ${mergedConfig.maxConditionLength} characters`,
        );
    }

    // All the same checks as user code
    validateUserCode(condition, {
        ...config,
        maxCodeLength: mergedConfig.maxConditionLength,
    });

    // Additional check: conditions should only contain safe characters
    if (!SAFE_EXPRESSION_PATTERN.test(condition)) {
        throw new Error('Condition contains invalid characters');
    }
}

/**
 * Checks for dangerous code patterns (expression mode — strict)
 */
function checkDangerousPatterns(code: string): void {
    const patterns = DANGEROUS_PATTERNS;

    if (patterns.STATEMENT_PATTERNS.test(code)) {
        throw new Error(
            'Code contains disallowed patterns (semicolons, braces, backticks, or template literals)',
        );
    }

    if (patterns.COMMENT_PATTERNS.test(code)) {
        throw new Error('Code contains disallowed comment syntax');
    }

    if (patterns.ESCAPE_SEQUENCES.test(code)) {
        throw new Error('Code contains disallowed escape sequences');
    }

    if (patterns.UNICODE_ESCAPES.test(code)) {
        throw new Error('Code contains disallowed unicode characters');
    }

    if (patterns.OCTAL_ESCAPES.test(code)) {
        throw new Error('Code contains disallowed octal escape sequences');
    }

    if (patterns.HTML_ENTITIES.test(code)) {
        throw new Error('Code contains disallowed HTML entities');
    }

    if (patterns.BASE64_PATTERNS.test(code)) {
        throw new Error('Code contains disallowed base64 functions');
    }

    if (patterns.STRING_CONCAT_TRICKS.test(code)) {
        throw new Error('Code contains disallowed string concatenation patterns');
    }

    if (patterns.COMPUTED_PROPERTY_ACCESS.test(code)) {
        throw new Error('Code contains disallowed computed property access');
    }
}

/**
 * Checks for dangerous patterns in script blocks (permissive mode).
 * Allows semicolons, braces, and comments which are valid in scripts.
 * Still blocks encoding/obfuscation attacks.
 */
function checkScriptDangerousPatterns(code: string): void {
    const patterns = DANGEROUS_PATTERNS;

    if (patterns.ESCAPE_SEQUENCES.test(code)) {
        throw new Error('Code contains disallowed escape sequences');
    }

    if (patterns.UNICODE_ESCAPES.test(code)) {
        throw new Error('Code contains disallowed unicode characters');
    }

    if (patterns.OCTAL_ESCAPES.test(code)) {
        throw new Error('Code contains disallowed octal escape sequences');
    }

    if (patterns.HTML_ENTITIES.test(code)) {
        throw new Error('Code contains disallowed HTML entities');
    }

    if (patterns.BASE64_PATTERNS.test(code)) {
        throw new Error('Code contains disallowed base64 functions');
    }

    if (patterns.STRING_CONCAT_TRICKS.test(code)) {
        throw new Error('Code contains disallowed string concatenation patterns');
    }

    if (patterns.COMPUTED_PROPERTY_ACCESS.test(code)) {
        throw new Error('Code contains disallowed computed property access');
    }
}

/**
 * Checks for disallowed keywords (strict — for simple expressions)
 */
function checkDisallowedKeywords(code: string): void {
    if (DISALLOWED_KEYWORDS_PATTERN.test(code)) {
        const match = code.match(DISALLOWED_KEYWORDS_PATTERN);
        throw new Error(
            `Code contains disallowed keyword: ${match?.[1] ?? 'unknown'}`,
        );
    }
}

/**
 * Checks for disallowed keywords in script blocks (permissive — allows new/class/extends)
 */
function checkScriptDisallowedKeywords(code: string): void {
    if (SCRIPT_DISALLOWED_KEYWORDS_PATTERN.test(code)) {
        const match = code.match(SCRIPT_DISALLOWED_KEYWORDS_PATTERN);
        throw new Error(
            `Code contains disallowed keyword: ${match?.[1] ?? 'unknown'}`,
        );
    }
}

/**
 * Checks for prototype pollution attack patterns
 */
function checkPrototypePollution(code: string): void {
    for (const pattern of PROTOTYPE_POLLUTION_PATTERNS) {
        if (pattern.test(code)) {
            throw new Error(
                'Code contains potential prototype pollution pattern',
            );
        }
    }
}

/**
 * Checks expression complexity to prevent resource exhaustion
 */
function checkExpressionComplexity(
    code: string,
    config: CodeSecurityConfig,
): void {
    // Count nesting depth
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of code) {
        if (char === '(' || char === '[') {
            currentDepth++;
            maxDepth = Math.max(maxDepth, currentDepth);
        } else if (char === ')' || char === ']') {
            currentDepth--;
        }
    }

    // Count operators
    const operatorMatches = code.match(/[+\-*/%&|!?:<>=]/g);
    const operatorCount = operatorMatches?.length ?? 0;

    // Calculate complexity score
    const complexityScore = maxDepth * 2 + operatorCount;

    if (complexityScore > config.maxExpressionComplexity) {
        throw new Error(
            `Expression complexity (${complexityScore}) exceeds maximum allowed (${config.maxExpressionComplexity})`,
        );
    }

    // Check property access depth
    const propertyAccessMatches = code.match(/\./g);
    const propertyAccessCount = propertyAccessMatches?.length ?? 0;

    if (propertyAccessCount > config.maxPropertyAccessDepth) {
        throw new Error(
            `Property access depth (${propertyAccessCount}) exceeds maximum allowed (${config.maxPropertyAccessDepth})`,
        );
    }
}

/**
 * Creates a frozen sandbox environment with safe globals
 * All objects are deeply frozen to prevent modification
 */
export function createCodeSandbox(
    additionalGlobals: Record<string, unknown> = {},
): Record<string, unknown> {
    // Create safe wrapper for Array that prevents prototype access
    const SafeArray = {
        isArray: Array.isArray.bind(Array),
        from: (arr: unknown) => {
            if (!Array.isArray(arr) && typeof arr !== 'string') {
                throw new Error('Array.from only accepts arrays or strings');
            }
            return Array.from(arr as Iterable<unknown>);
        },
        of: (...items: unknown[]) => Array.of(...items),
    };

    // Create safe wrapper for Object that prevents dangerous operations
    const SafeObject = {
        keys: (obj: object) => {
            if (obj === null || typeof obj !== 'object') {
                throw new Error('Object.keys requires an object');
            }
            return Object.keys(obj);
        },
        values: (obj: object) => {
            if (obj === null || typeof obj !== 'object') {
                throw new Error('Object.values requires an object');
            }
            return Object.values(obj);
        },
        entries: (obj: object) => {
            if (obj === null || typeof obj !== 'object') {
                throw new Error('Object.entries requires an object');
            }
            return Object.entries(obj);
        },
        assign: (target: object, ...sources: object[]) => {
            if (target === null || typeof target !== 'object') {
                throw new Error('Object.assign requires an object target');
            }
            return Object.assign({}, target, ...sources);
        },
        freeze: (obj: object) => Object.freeze(obj),
        isFrozen: (obj: object) => Object.isFrozen(obj),
        hasOwn: (obj: object, key: string) => {
            if (typeof key !== 'string') {
                throw new Error('Property key must be a string');
            }
            // Prevent prototype pollution via hasOwn
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                return false;
            }
            return Object.prototype.hasOwnProperty.call(obj, key);
        },
    };

    // Create safe Math wrapper
    const SafeMath = {
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        max: Math.max,
        min: Math.min,
        pow: Math.pow,
        sqrt: Math.sqrt,
        random: Math.random,
        sign: Math.sign,
        trunc: Math.trunc,
        PI: Math.PI,
        E: Math.E,
    };

    // Create safe JSON wrapper
    const SafeJSON = {
        parse: (text: string) => {
            if (typeof text !== 'string') {
                throw new Error('JSON.parse requires a string');
            }
            const parsed = JSON.parse(text);
            // Prevent prototype pollution in parsed objects
            return sanitizeJsonObject(parsed);
        },
        stringify: (value: unknown) => JSON.stringify(value),
    };

    // Create safe Date wrapper that supports both constructor and static methods.
    // Date construction is safe (no prototype pollution risk) and extremely common
    // in user scripts for timestamps. We wrap Date to ensure consistent behavior
    // while preserving `new Date()`, `new Date(timestamp)`, `new Date(string)`.
    class SafeDateClass {
        private _date: Date;
        constructor(value?: string | number | Date) {
            this._date = value === undefined ? new Date() : new Date(value as string | number);
        }
        getTime() { return this._date.getTime(); }
        toISOString() { return this._date.toISOString(); }
        toJSON() { return this._date.toJSON(); }
        toString() { return this._date.toString(); }
        toUTCString() { return this._date.toUTCString(); }
        toLocaleDateString(...args: Parameters<Date['toLocaleDateString']>) { return this._date.toLocaleDateString(...args); }
        toLocaleTimeString(...args: Parameters<Date['toLocaleTimeString']>) { return this._date.toLocaleTimeString(...args); }
        toLocaleString(...args: Parameters<Date['toLocaleString']>) { return this._date.toLocaleString(...args); }
        valueOf() { return this._date.valueOf(); }
        getFullYear() { return this._date.getFullYear(); }
        getMonth() { return this._date.getMonth(); }
        getDate() { return this._date.getDate(); }
        getDay() { return this._date.getDay(); }
        getHours() { return this._date.getHours(); }
        getMinutes() { return this._date.getMinutes(); }
        getSeconds() { return this._date.getSeconds(); }
        getMilliseconds() { return this._date.getMilliseconds(); }
        getTimezoneOffset() { return this._date.getTimezoneOffset(); }
        static now() { return Date.now(); }
        static parse(s: string) { return Date.parse(s); }
        static UTC(...args: Parameters<typeof Date.UTC>) { return Date.UTC(...args); }
    }
    const SafeDate = SafeDateClass as unknown as DateConstructor;

    const sandbox: Record<string, unknown> = {
        // Safe wrappers
        Array: SafeArray,
        Object: SafeObject,
        Math: SafeMath,
        JSON: SafeJSON,
        Date: SafeDate,

        // Primitive constructors (safe for type coercion)
        String: (val: unknown) => String(val),
        Number: (val: unknown) => Number(val),
        Boolean: (val: unknown) => Boolean(val),

        // Safe global functions
        isArray: Array.isArray,
        keys: SafeObject.keys,
        values: SafeObject.values,
        entries: SafeObject.entries,
        isNaN: Number.isNaN,
        isFinite: Number.isFinite,
        parseFloat,
        parseInt,

        // URI functions (safe)
        encodeURI,
        decodeURI,
        encodeURIComponent,
        decodeURIComponent,

        // Constants
        undefined,
        NaN,
        Infinity,

        // Type checking helpers
        typeof: (val: unknown) => typeof val,
        isNull: (val: unknown) => val === null,
        isUndefined: (val: unknown) => val === undefined,
        isString: (val: unknown) => typeof val === 'string',
        isNumber: (val: unknown) => typeof val === 'number',
        isBoolean: (val: unknown) => typeof val === 'boolean',
        isObject: (val: unknown) => val !== null && typeof val === 'object',

        // Add user-provided globals (validated)
        ...sanitizeAdditionalGlobals(additionalGlobals),
    };

    // Deep freeze the sandbox to prevent modifications
    return deepFreeze(sandbox);
}

/**
 * Sanitizes JSON objects to prevent prototype pollution
 */
function sanitizeJsonObject(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeJsonObject);
    }

    const sanitized: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(obj)) {
        // Skip dangerous keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }
        sanitized[key] = sanitizeJsonObject(value);
    }

    return sanitized;
}

/**
 * Sanitizes additional globals to prevent injection
 */
function sanitizeAdditionalGlobals(
    globals: Record<string, unknown>,
): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(globals)) {
        // Skip dangerous keys
        if (DISALLOWED_KEYWORDS.includes(key as typeof DISALLOWED_KEYWORDS[number])) {
            continue;
        }

        // Skip if key looks like prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }

        // Don't allow functions that could be exploited
        if (typeof value === 'function') {
            // Wrap functions to prevent access to their properties
            sanitized[key] = createSafeFunction(value as (...args: unknown[]) => unknown);
        } else if (value !== null && typeof value === 'object') {
            sanitized[key] = sanitizeJsonObject(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

/**
 * Creates a safe wrapper around a function
 */
function createSafeFunction(
    fn: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
    const wrapper = (...args: unknown[]) => fn(...args);

    // Remove access to function properties
    Object.defineProperty(wrapper, 'constructor', {
        value: undefined,
        writable: false,
        configurable: false,
    });

    return wrapper;
}

/**
 * Deep freezes an object and all nested objects
 */
function deepFreeze<T extends object>(obj: T): T {
    Object.freeze(obj);

    for (const key of Object.keys(obj)) {
        const value = (obj as Record<string, unknown>)[key];
        if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value as object);
        }
    }

    return obj;
}
