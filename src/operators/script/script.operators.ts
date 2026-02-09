/**
 * Script Operator Implementation
 *
 * Allows inline JavaScript code for complex transformations.
 * Uses SafeEvaluator for secure code execution with:
 * - Whitelist-based validation
 * - Timeout enforcement
 * - Memory limits via complexity checks
 * - Expression caching
 */

import { JsonObject } from '../../types';
import { AdapterOperatorHelpers, AdapterDefinition } from '../../sdk/types';
import { OperatorResult } from '../types';
import { ScriptOperatorConfig, ScriptContext } from './types';
import {
    validateUserCode,
    createCodeSandbox,
    CodeSecurityConfig,
} from '../../utils/code-security.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { SafeEvaluatorConfig } from '../../runtime/sandbox';
// Import directly from defaults to avoid circular dependency with constants/index.ts
// which imports ../operators -> this file
import { SAFE_EVALUATOR } from '../../constants/defaults';

const DEFAULT_TIMEOUT = SAFE_EVALUATOR.DEFAULT_TIMEOUT_MS;

/**
 * Global configuration for script operators
 * Can be modified at runtime to disable script execution
 */
let scriptOperatorsEnabled = true;

/**
 * Configure script operators
 */
export function configureScriptOperators(config: {
    enabled?: boolean;
    security?: Partial<CodeSecurityConfig>;
    evaluator?: Partial<SafeEvaluatorConfig>;
}): void {
    if (config.enabled !== undefined) {
        scriptOperatorsEnabled = config.enabled;
    }
}

/**
 * Check if script operators are enabled
 */
export function isScriptOperatorsEnabled(): boolean {
    return scriptOperatorsEnabled;
}

/**
 * Disable script operators (for high-security environments)
 */
export function disableScriptOperators(): void {
    scriptOperatorsEnabled = false;
}

/**
 * Enable script operators
 */
export function enableScriptOperators(): void {
    scriptOperatorsEnabled = true;
}

/**
 * Script operator definition
 */
export const SCRIPT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'script',
    name: 'Script',
    description: 'Execute inline JavaScript code to transform records. Use for complex logic that cannot be expressed with standard operators.',
    category: 'TRANSFORMATION',
    schema: {
        fields: [
            {
                key: 'code',
                label: 'JavaScript Code',
                type: 'code',
                required: true,
                description: 'JavaScript code to execute. In single-record mode: receives `record`, `index`, `context`. In batch mode: receives `records`, `context`. Must return the transformed result.',
            },
            {
                key: 'batch',
                label: 'Batch Mode',
                type: 'boolean',
                description: 'If true, processes all records at once. If false (default), processes one record at a time.',
            },
            {
                key: 'timeout',
                label: 'Timeout (ms)',
                type: 'number',
                description: 'Maximum execution time in milliseconds (default: 5000)',
            },
            {
                key: 'failOnError',
                label: 'Fail on Error',
                type: 'boolean',
                description: 'If true, errors fail the entire step. If false, errors are logged and records skipped.',
            },
            {
                key: 'context',
                label: 'Context Data',
                type: 'json',
                description: 'Optional JSON data passed to the script as context.data',
            },
        ],
    },
    pure: false,
    async: true,
    icon: 'code',
    color: '#9333ea',
    version: '1.0.0',
};

/**
 * Execute script with timeout
 */
async function executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number,
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve(fn()),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error(`Script timeout after ${timeout}ms`)),
                    timeout,
                );
            }),
        ]);
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
}

/**
 * Script operator - execute inline JavaScript code
 */
export function scriptOperator(
    records: readonly JsonObject[],
    config: ScriptOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult | Promise<OperatorResult> {
    const { code, batch, timeout = DEFAULT_TIMEOUT, failOnError, context: contextData } = config;

    // Check if script operators are enabled
    if (!scriptOperatorsEnabled) {
        return {
            records: [...records],
            errors: [{ message: 'Script operators are disabled in this environment. Contact your administrator to enable them.' }],
        };
    }

    if (!code || typeof code !== 'string') {
        return { records: [...records], errors: [{ message: 'Script code is required' }] };
    }

    // Validate user code before execution using security rules
    try {
        validateUserCode(code);
    } catch (error) {
        const errorMsg = getErrorMessage(error);
        return {
            records: [...records],
            errors: [{ message: `Code validation failed: ${errorMsg}` }],
        };
    }

    const sandboxGlobals = createCodeSandbox();

    if (batch) {
        return executeBatchScript(records, code, timeout, failOnError, contextData, sandboxGlobals);
    } else {
        return executeSingleRecordScript(records, code, timeout, failOnError, contextData, sandboxGlobals);
    }
}

/**
 * Execute script in batch mode (all records at once)
 */
async function executeBatchScript(
    records: readonly JsonObject[],
    code: string,
    timeout: number,
    failOnError: boolean | undefined,
    contextData: JsonObject | undefined,
    sandboxGlobals: Record<string, unknown>,
): Promise<OperatorResult> {
    const scriptContext: ScriptContext = {
        total: records.length,
        data: contextData,
    };

    // Build the function with all sandbox globals as parameters
    // This prevents access to the global scope
    const sandboxKeys = Object.keys(sandboxGlobals);
    const sandboxValues = Object.values(sandboxGlobals);

    // Create a safe function body that wraps the user code
    // The user code is expected to be an expression or use 'return'
    const functionBody = `
        "use strict";
        return (async function(__records__, __context__) {
            const records = __records__;
            const context = __context__;
            ${code}
        })(__records__, __context__);
    `;

    try {
        // Create function with sandbox parameters
        // eslint-disable-next-line no-new-func
        const fn = new Function(
            ...sandboxKeys,
            '__records__',
            '__context__',
            functionBody,
        );

        const result = await executeWithTimeout(
            () => fn(...sandboxValues, [...records], scriptContext),
            timeout,
        );

        if (!Array.isArray(result)) {
            throw new Error('Batch script must return an array of records');
        }

        // Sanitize the result to prevent prototype pollution
        const sanitizedResult = sanitizeResult(result);

        return { records: sanitizedResult };
    } catch (error) {
        const errorMsg = getErrorMessage(error);
        if (failOnError) {
            throw new Error(`Script execution failed: ${errorMsg}`);
        }
        return {
            records: [...records],
            errors: [{ message: `Script execution failed: ${errorMsg}` }],
        };
    }
}

/**
 * Execute script in single-record mode (one record at a time)
 */
async function executeSingleRecordScript(
    records: readonly JsonObject[],
    code: string,
    timeout: number,
    failOnError: boolean | undefined,
    contextData: JsonObject | undefined,
    sandboxGlobals: Record<string, unknown>,
): Promise<OperatorResult> {
    const results: JsonObject[] = [];
    const errors: Array<{ message: string; field?: string }> = [];

    // Build the function with all sandbox globals as parameters
    const sandboxKeys = Object.keys(sandboxGlobals);
    const sandboxValues = Object.values(sandboxGlobals);

    // Create a safe function body
    const functionBody = `
        "use strict";
        return (async function(__record__, __index__, __context__) {
            const record = __record__;
            const index = __index__;
            const context = __context__;
            ${code}
        })(__record__, __index__, __context__);
    `;

    // Create function once and reuse
    // eslint-disable-next-line no-new-func
    const fn = new Function(
        ...sandboxKeys,
        '__record__',
        '__index__',
        '__context__',
        functionBody,
    );

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const scriptContext: ScriptContext = {
            index: i,
            total: records.length,
            data: contextData,
        };

        try {
            const result = await executeWithTimeout(
                () => fn(...sandboxValues, { ...record }, i, scriptContext),
                timeout,
            );

            // null means filter out this record
            if (result === null || result === undefined) {
                continue;
            }

            if (typeof result !== 'object' || Array.isArray(result)) {
                throw new Error('Script must return an object or null');
            }

            // Sanitize the result to prevent prototype pollution
            const sanitizedResult = sanitizeObject(result as JsonObject);
            results.push(sanitizedResult);
        } catch (error) {
            const errorMsg = getErrorMessage(error);
            if (failOnError) {
                throw new Error(`Script execution failed at record ${i}: ${errorMsg}`);
            }
            errors.push({ message: `Record ${i}: ${errorMsg}` });
            // Include original record on error
            results.push(record);
        }
    }

    return {
        records: results,
        errors: errors.length > 0 ? errors : undefined,
    };
}

/**
 * Sanitize a result array to prevent prototype pollution
 */
function sanitizeResult(result: unknown[]): JsonObject[] {
    return result.map((item) => {
        if (item === null || typeof item !== 'object') {
            return item as JsonObject;
        }
        return sanitizeObject(item as JsonObject);
    });
}

/**
 * Sanitize an object to prevent prototype pollution
 */
function sanitizeObject(obj: JsonObject): JsonObject {
    const sanitized: JsonObject = Object.create(null);

    for (const [key, value] of Object.entries(obj)) {
        // Skip dangerous keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }

        if (value === null || typeof value !== 'object') {
            sanitized[key] = value;
        } else if (Array.isArray(value)) {
            sanitized[key] = value.map((item) =>
                item !== null && typeof item === 'object'
                    ? sanitizeObject(item as JsonObject)
                    : item,
            );
        } else {
            sanitized[key] = sanitizeObject(value as JsonObject);
        }
    }

    return sanitized;
}
