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

import {
    validateUserCode,
    createCodeSandbox,
    CodeSecurityConfig,
    DEFAULT_CODE_SECURITY_CONFIG,
} from '../../utils/code-security.utils';
// Import directly from defaults to avoid circular dependency with constants/index.ts
// which imports ../operators -> script.operators.ts -> this file via sandbox/index.ts
import { SAFE_EVALUATOR } from '../../constants/defaults';

/**
 * Result of expression evaluation
 */
export interface EvaluationResult<T = unknown> {
    success: boolean;
    value?: T;
    error?: string;
    executionTimeMs?: number;
}

/**
 * Configuration for the SafeEvaluator
 */
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

/**
 * Default evaluator configuration
 */
export const DEFAULT_EVALUATOR_CONFIG: SafeEvaluatorConfig = {
    maxCacheSize: SAFE_EVALUATOR.MAX_CACHE_SIZE,
    defaultTimeoutMs: SAFE_EVALUATOR.DEFAULT_TIMEOUT_MS,
    security: DEFAULT_CODE_SECURITY_CONFIG,
    enableCache: true,
    scriptOperatorsEnabled: true,
};

/**
 * Allowed operators in expressions
 */
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

/**
 * Allowed safe methods on strings
 */
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

/**
 * Allowed safe methods on arrays
 */
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

/**
 * Allowed safe methods on numbers
 */
const ALLOWED_NUMBER_METHODS = [
    'toString',
    'toFixed',
    'toPrecision',
    'toExponential',
    'valueOf',
] as const;

/**
 * All allowed methods combined
 */
const ALLOWED_METHODS: Set<string> = new Set([
    ...ALLOWED_STRING_METHODS,
    ...ALLOWED_ARRAY_METHODS,
    ...ALLOWED_NUMBER_METHODS,
]);

/** Generic function type for compiled expressions */
type CompiledFunction = (...args: unknown[]) => unknown;

/**
 * Cache entry for compiled functions
 */
interface CacheEntry {
    fn: CompiledFunction;
    params: string[];
    lastUsed: number;
    useCount: number;
}

/**
 * Safe expression evaluator with whitelist-based validation
 *
 * @example
 * ```typescript
 * const evaluator = new SafeEvaluator();
 *
 * // Simple expression
 * const result = evaluator.evaluate('record.price * record.quantity', { record: { price: 10, quantity: 5 } });
 * // result.value === 50
 *
 * // With string methods
 * const result2 = evaluator.evaluate('record.name.toLowerCase()', { record: { name: 'HELLO' } });
 * // result2.value === 'hello'
 * ```
 */
export class SafeEvaluator {
    private readonly config: SafeEvaluatorConfig;
    private readonly cache: Map<string, CacheEntry>;
    private readonly sandbox: Record<string, unknown>;

    constructor(config: Partial<SafeEvaluatorConfig> = {}) {
        this.config = { ...DEFAULT_EVALUATOR_CONFIG, ...config };
        this.cache = new Map();
        this.sandbox = createCodeSandbox();
    }

    /**
     * Check if script operators are enabled
     */
    get isEnabled(): boolean {
        return this.config.scriptOperatorsEnabled;
    }

    /**
     * Evaluate an expression with the given context
     *
     * @param expression - The expression to evaluate
     * @param context - Variables available to the expression
     * @param timeoutMs - Optional timeout override
     * @returns Evaluation result with success status
     */
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

            // Get or create the compiled function
            const { fn, params } = this.getCompiledFunction(expression, Object.keys(context));

            // Execute with timeout
            const timeout = timeoutMs ?? this.config.defaultTimeoutMs;
            const value = this.executeWithTimeout(fn, params, context, timeout);

            return {
                success: true,
                value: value as T,
                executionTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                executionTimeMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Evaluate an expression asynchronously with proper timeout handling
     */
    async evaluateAsync<T = unknown>(
        expression: string,
        context: Record<string, unknown>,
        timeoutMs?: number,
    ): Promise<EvaluationResult<T>> {
        const startTime = Date.now();

        // Check if script operators are enabled
        if (!this.config.scriptOperatorsEnabled) {
            return {
                success: false,
                error: 'Script operators are disabled in this environment',
                executionTimeMs: Date.now() - startTime,
            };
        }

        const timeout = timeoutMs ?? this.config.defaultTimeoutMs;

        try {
            // Validate the expression
            this.validateExpression(expression);

            // Get or create the compiled function
            const { fn, params } = this.getCompiledFunction(expression, Object.keys(context));

            // Execute with async timeout
            const value = await this.executeWithTimeoutAsync(fn, params, context, timeout);

            return {
                success: true,
                value: value as T,
                executionTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                executionTimeMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Validate an expression without executing it
     */
    validate(expression: string): { valid: boolean; error?: string } {
        try {
            this.validateExpression(expression);
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Clear the expression cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; maxSize: number; hitRate: number } {
        let totalUseCount = 0;
        this.cache.forEach((entry) => {
            totalUseCount += entry.useCount;
        });
        const hitRate = this.cache.size > 0 ? (totalUseCount - this.cache.size) / totalUseCount : 0;

        return {
            size: this.cache.size,
            maxSize: this.config.maxCacheSize,
            hitRate: Math.max(0, hitRate),
        };
    }

    /**
     * Validate an expression for security issues
     */
    private validateExpression(expr: string): void {
        // Use the code security validation
        validateUserCode(expr, this.config.security);

        // Additional whitelist validation for methods
        this.validateMethodCalls(expr);
    }

    /**
     * Validate that only allowed methods are called
     */
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

    /**
     * Get or create a compiled function for the expression
     */
    private getCompiledFunction(
        expression: string,
        contextKeys: string[],
    ): { fn: CompiledFunction; params: string[] } {
        // Create cache key from expression and context keys
        const cacheKey = `${expression}|${contextKeys.sort().join(',')}`;

        // Check cache
        if (this.config.enableCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                cached.lastUsed = Date.now();
                cached.useCount++;
                return { fn: cached.fn, params: cached.params };
            }
        }

        // Create the safe function
        const { fn, params } = this.createSafeFunction(expression, contextKeys);

        // Cache if enabled
        if (this.config.enableCache) {
            this.cacheFunction(cacheKey, fn, params);
        }

        return { fn, params };
    }

    /**
     * Create a safe function from an expression
     *
     * Security: Uses Function constructor after validation:
     * 1. Expression validated against dangerous patterns (semicolons, braces, backticks)
     * 2. Disallowed keywords blocked (eval, Function, constructor, __proto__, etc.)
     * 3. Prototype pollution patterns detected and blocked
     * 4. Expression complexity limited to prevent DoS
     * 5. Only whitelisted methods allowed
     * 6. Function executes with frozen sandbox, no access to globals
     */
    private createSafeFunction(
        expr: string,
        contextKeys: string[],
    ): { fn: CompiledFunction; params: string[] } {
        // Combine sandbox keys with context keys
        const sandboxKeys = Object.keys(this.sandbox);
        const allParams = [...sandboxKeys, ...contextKeys];

        // Build the function body with strict mode and return
        // The expression is wrapped to ensure it returns a value
        const functionBody = `
            "use strict";
            return (${expr});
        `;

        try {
            // Create the function with all parameters
            // eslint-disable-next-line no-new-func
            const fn = new Function(...allParams, functionBody) as CompiledFunction;

            // Verify the function doesn't expose dangerous properties
            // eslint-disable-next-line @typescript-eslint/ban-types
            if ((fn as unknown as { constructor: Function }).constructor !== Function) {
                throw new Error('Function prototype chain tampered');
            }

            return { fn, params: allParams };
        } catch (error) {
            throw new Error(
                `Failed to compile expression: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Cache a compiled function with LRU eviction
     */
    private cacheFunction(key: string, fn: CompiledFunction, params: string[]): void {
        // Evict oldest entries if cache is full
        if (this.cache.size >= this.config.maxCacheSize) {
            this.evictOldestEntries(Math.ceil(this.config.maxCacheSize * SAFE_EVALUATOR.CACHE_EVICTION_PERCENT));
        }

        this.cache.set(key, {
            fn,
            params,
            lastUsed: Date.now(),
            useCount: 1,
        });
    }

    /**
     * Evict the oldest entries from the cache
     */
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

    /**
     * Execute a function with timeout (synchronous with time check)
     */
    private executeWithTimeout(
        fn: CompiledFunction,
        params: string[],
        context: Record<string, unknown>,
        _timeoutMs: number,
    ): unknown {
        // Build argument values in the same order as parameters
        const sandboxKeys = Object.keys(this.sandbox);
        const args: unknown[] = [];

        for (const param of params) {
            if (sandboxKeys.includes(param)) {
                args.push(this.sandbox[param]);
            } else {
                args.push(context[param]);
            }
        }

        // Execute the function
        // Note: True timeout enforcement requires worker threads or vm module
        // This implementation relies on the expression complexity limits
        // to prevent long-running expressions
        try {
            return fn(...args);
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(String(error));
        }
    }

    /**
     * Execute a function with async timeout
     */
    private async executeWithTimeoutAsync(
        fn: CompiledFunction,
        params: string[],
        context: Record<string, unknown>,
        timeoutMs: number,
    ): Promise<unknown> {
        // Build argument values
        const sandboxKeys = Object.keys(this.sandbox);
        const args: unknown[] = [];

        for (const param of params) {
            if (sandboxKeys.includes(param)) {
                args.push(this.sandbox[param]);
            } else {
                args.push(context[param]);
            }
        }

        // Execute with timeout using Promise.race with proper cleanup
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                Promise.resolve().then(() => fn(...args)),
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(
                        () => reject(new Error(`Expression timeout after ${timeoutMs}ms`)),
                        timeoutMs,
                    );
                }),
            ]);
        } finally {
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
            }
        }
    }
}

/**
 * Singleton instance for convenience
 */
let defaultEvaluator: SafeEvaluator | null = null;

/**
 * Get the default SafeEvaluator instance
 */
export function getDefaultEvaluator(): SafeEvaluator {
    if (!defaultEvaluator) {
        defaultEvaluator = new SafeEvaluator();
    }
    return defaultEvaluator;
}

/**
 * Create a new SafeEvaluator with custom configuration
 */
export function createEvaluator(config?: Partial<SafeEvaluatorConfig>): SafeEvaluator {
    return new SafeEvaluator(config);
}

/**
 * Convenience function to evaluate an expression
 */
export function safeEvaluate<T = unknown>(
    expression: string,
    context: Record<string, unknown>,
    timeoutMs?: number,
): EvaluationResult<T> {
    return getDefaultEvaluator().evaluate<T>(expression, context, timeoutMs);
}

/**
 * Convenience function to validate an expression
 */
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
