/**
 * Safe Expression Evaluator
 *
 * Secure evaluation of user-provided expressions with:
 * - Whitelist of allowed operations
 * - No access to global objects
 * - Timeout enforcement
 * - Memory limits via code complexity
 * - LRU cache for compiled expressions
 */

import * as vm from 'vm';
import {
    validateUserCode,
    createCodeSandbox,
    CodeSecurityConfig,
    DEFAULT_CODE_SECURITY_CONFIG,
} from '../../utils/code-security.utils';
import { getErrorMessage } from '../../utils/error.utils';
// Import directly from defaults to avoid circular dependency with constants/index.ts
// which imports ../operators -> script.operators.ts -> this file via sandbox/index.ts
import { SAFE_EVALUATOR } from '../../constants/defaults';

export interface EvaluationResult<T = unknown> {
    success: boolean;
    value?: T;
    error?: string;
    executionTimeMs?: number;
}

export interface SafeEvaluatorConfig {
    /** Maximum number of cached compiled functions */
    maxCacheSize: number;
    /** Default timeout in milliseconds */
    defaultTimeoutMs: number;
    /** Security configuration */
    security: CodeSecurityConfig;
    /** Whether to enable caching */
    enableCache: boolean;
    /** Whether script operators are enabled (for high-security environments) */
    scriptOperatorsEnabled: boolean;
}

export const DEFAULT_EVALUATOR_CONFIG: SafeEvaluatorConfig = {
    maxCacheSize: SAFE_EVALUATOR.MAX_CACHE_SIZE,
    defaultTimeoutMs: SAFE_EVALUATOR.DEFAULT_TIMEOUT_MS,
    security: DEFAULT_CODE_SECURITY_CONFIG,
    enableCache: true,
    scriptOperatorsEnabled: true,
};

const ALLOWED_OPERATORS = [
    '+',
    '-',
    '*',
    '/',
    '%',
    '===',
    '!==',
    '==',
    '!=',
    '>',
    '<',
    '>=',
    '<=',
    '&&',
    '||',
    '!',
    '?',
    ':',
    '??',
] as const;

const ALLOWED_STRING_METHODS = [
    'toString',
    'toLowerCase',
    'toUpperCase',
    'trim',
    'trimStart',
    'trimEnd',
    'split',
    'join',
    'slice',
    'substring',
    'substr',
    'includes',
    'startsWith',
    'endsWith',
    'replace',
    'replaceAll',
    'match',
    'indexOf',
    'lastIndexOf',
    'charAt',
    'charCodeAt',
    'concat',
    'padStart',
    'padEnd',
    'repeat',
    'normalize',
] as const;

const ALLOWED_ARRAY_METHODS = [
    'length',
    'join',
    'slice',
    'concat',
    'includes',
    'indexOf',
    'lastIndexOf',
    'find',
    'findIndex',
    'filter',
    'map',
    'reduce',
    'reduceRight',
    'every',
    'some',
    'flat',
    'flatMap',
    'reverse',
    'sort',
    'at',
    'fill',
    'copyWithin',
    'entries',
    'keys',
    'values',
] as const;

const ALLOWED_NUMBER_METHODS = [
    'toString',
    'toFixed',
    'toPrecision',
    'toExponential',
    'valueOf',
] as const;

const ALLOWED_METHODS: Set<string> = new Set([
    ...ALLOWED_STRING_METHODS,
    ...ALLOWED_ARRAY_METHODS,
    ...ALLOWED_NUMBER_METHODS,
]);

interface CacheEntry {
    script: vm.Script;
    params: string[];
    lastUsed: number;
    useCount: number;
}

/** Whitelist-based expression evaluator with security validation */
export class SafeEvaluator {
    private readonly config: SafeEvaluatorConfig;
    private readonly cache: Map<string, CacheEntry>;
    private readonly sandbox: Record<string, unknown>;

    constructor(config: Partial<SafeEvaluatorConfig> = {}) {
        this.config = { ...DEFAULT_EVALUATOR_CONFIG, ...config };
        this.cache = new Map();
        this.sandbox = createCodeSandbox();
    }

    evaluate<T = unknown>(
        expression: string,
        context: Record<string, unknown>,
        timeoutMs?: number,
    ): EvaluationResult<T> {
        const startTime = Date.now();

        // Check if script operators are enabled
        if (!this.config.scriptOperatorsEnabled) {
            return {
                success: false,
                error: 'Script operators are disabled in this environment',
                executionTimeMs: Date.now() - startTime,
            };
        }

        try {
            // Validate the expression
            this.validateExpression(expression);

            // Get or create the compiled script
            const { script, params } = this.getCompiledScript(expression, Object.keys(context));

            // Execute with timeout
            const timeout = timeoutMs ?? this.config.defaultTimeoutMs;
            const value = this.executeWithTimeout(script, params, context, timeout);

            return {
                success: true,
                value: value as T,
                executionTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                error: getErrorMessage(error),
                executionTimeMs: Date.now() - startTime,
            };
        }
    }

    validate(expression: string): { valid: boolean; error?: string } {
        try {
            this.validateExpression(expression);
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: getErrorMessage(error),
            };
        }
    }

    private validateExpression(expr: string): void {
        // Use the code security validation
        validateUserCode(expr, this.config.security);

        // Additional whitelist validation for methods
        this.validateMethodCalls(expr);
    }

    private validateMethodCalls(expr: string): void {
        // Match method calls: .methodName(
        const methodCallPattern = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
        let match;

        while ((match = methodCallPattern.exec(expr)) !== null) {
            const methodName = match[1];
            if (!ALLOWED_METHODS.has(methodName)) {
                throw new Error(`Method '${methodName}' is not allowed`);
            }
        }

        // Also check for bracket notation method access
        const bracketMethodPattern = /\[\s*['"]([a-zA-Z_$][a-zA-Z0-9_$]*)['"]\s*\]\s*\(/g;
        while ((match = bracketMethodPattern.exec(expr)) !== null) {
            const methodName = match[1];
            if (!ALLOWED_METHODS.has(methodName)) {
                throw new Error(`Method '${methodName}' is not allowed`);
            }
        }
    }

    private getCompiledScript(
        expression: string,
        contextKeys: string[],
    ): { script: vm.Script; params: string[] } {
        // Create cache key from expression and context keys
        const cacheKey = `${expression}|${contextKeys.sort().join(',')}`;

        // Check cache
        if (this.config.enableCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                cached.lastUsed = Date.now();
                cached.useCount++;
                return { script: cached.script, params: cached.params };
            }
        }

        // Create the safe script
        const { script, params } = this.createSafeScript(expression, contextKeys);

        // Cache if enabled
        if (this.config.enableCache) {
            this.cacheScript(cacheKey, script, params);
        }

        return { script, params };
    }

    /**
     * Create a safe vm.Script from an expression
     *
     * Security: Uses vm.Script + vm.createContext instead of Function constructor:
     * 1. Expression validated against dangerous patterns (semicolons, braces, backticks)
     * 2. Disallowed keywords blocked (eval, Function, constructor, __proto__, etc.)
     * 3. Prototype pollution patterns detected and blocked
     * 4. Expression complexity limited to prevent DoS
     * 5. Only whitelisted methods allowed
     * 6. Script executes in isolated vm context with hard CPU timeout
     */
    private createSafeScript(
        expr: string,
        contextKeys: string[],
    ): { script: vm.Script; params: string[] } {
        // Combine sandbox keys with context keys
        const sandboxKeys = Object.keys(this.sandbox);
        const allParams = [...sandboxKeys, ...contextKeys];

        // Build the script body with strict mode and expression evaluation
        const scriptBody = `"use strict"; (${expr});`;

        try {
            const script = new vm.Script(scriptBody, {
                filename: 'safe-expression',
            });

            return { script, params: allParams };
        } catch (error) {
            throw new Error(
                `Failed to compile expression: ${getErrorMessage(error)}`,
            );
        }
    }

    private cacheScript(key: string, script: vm.Script, params: string[]): void {
        // Evict oldest entries if cache is full
        if (this.cache.size >= this.config.maxCacheSize) {
            this.evictOldestEntries(Math.ceil(this.config.maxCacheSize * SAFE_EVALUATOR.CACHE_EVICTION_PERCENT));
        }

        this.cache.set(key, {
            script,
            params,
            lastUsed: Date.now(),
            useCount: 1,
        });
    }

    private evictOldestEntries(count: number): void {
        // Sort entries by last used time
        const entries = Array.from(this.cache.entries()).sort(
            ([, a], [, b]) => a.lastUsed - b.lastUsed,
        );

        // Remove the oldest entries
        for (let i = 0; i < count && i < entries.length; i++) {
            this.cache.delete(entries[i][0]);
        }
    }

    private executeWithTimeout(
        script: vm.Script,
        params: string[],
        context: Record<string, unknown>,
        timeoutMs: number,
    ): unknown {
        // Build the vm sandbox with sandbox values and context values
        const sandboxKeys = Object.keys(this.sandbox);
        const vmSandbox: Record<string, unknown> = {};

        for (const param of params) {
            if (sandboxKeys.includes(param)) {
                vmSandbox[param] = this.sandbox[param];
            } else {
                vmSandbox[param] = context[param];
            }
        }

        // Use vm.createContext + script.runInContext for hard CPU timeout enforcement.
        // vm enforces timeout at the V8 level (kills the microtask).
        const vmContext = vm.createContext(vmSandbox);
        try {
            return script.runInContext(vmContext, { timeout: timeoutMs });
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('Script execution timed out')) {
                    throw new Error(`Expression timeout after ${timeoutMs}ms`);
                }
                throw error;
            }
            throw new Error(String(error));
        }
    }
}

let defaultEvaluator: SafeEvaluator | null = null;

export function getDefaultEvaluator(): SafeEvaluator {
    if (!defaultEvaluator) {
        defaultEvaluator = new SafeEvaluator();
    }
    return defaultEvaluator;
}

export function createEvaluator(config?: Partial<SafeEvaluatorConfig>): SafeEvaluator {
    return new SafeEvaluator(config);
}

export function safeEvaluate<T = unknown>(
    expression: string,
    context: Record<string, unknown>,
    timeoutMs?: number,
): EvaluationResult<T> {
    return getDefaultEvaluator().evaluate<T>(expression, context, timeoutMs);
}

export function validateExpression(expression: string): { valid: boolean; error?: string } {
    return getDefaultEvaluator().validate(expression);
}

// Export allowed operations for documentation
export {
    ALLOWED_OPERATORS,
    ALLOWED_STRING_METHODS,
    ALLOWED_ARRAY_METHODS,
    ALLOWED_NUMBER_METHODS,
    ALLOWED_METHODS,
};
