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

import { createContext, Script } from 'vm';
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
 * Create an isolated vm context with frozen safe copies of builtins.
 *
 * Uses Object.create(null) for no prototype chain, and frozen copies
 * of globals to prevent prototype pollution of the host process.
 */
function createSafeVmContext(sandboxGlobals: Record<string, unknown>): object {
    const safeContext = createContext(Object.create(null), {
        codeGeneration: { strings: false, wasm: false },
    });
    Object.assign(safeContext, sandboxGlobals);
    return safeContext;
}

/**
 * Execute script code in an isolated vm context with a hard timeout.
 *
 * Unlike Promise.race, vm.Script.runInContext with a timeout option
 * can actually terminate CPU-bound synchronous loops (e.g. while(true){}).
 */
async function executeInVm(
    code: string,
    vmContext: object,
    timeout: number,
): Promise<unknown> {
    const script = new Script(code, {
        filename: 'script-operator.js',
    });

    // runInContext with timeout truly kills CPU-bound code
    return script.runInContext(vmContext, {
        timeout,
        breakOnSigint: true,
    });
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
 *
 * Uses vm.Script with isolated context for safe execution and hard timeout.
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

    try {
        // Create isolated vm context with frozen sandbox globals
        const vmContext = createSafeVmContext({
            ...sandboxGlobals,
            // Deep-copy records and context to prevent cross-boundary mutation
            __records__: JSON.parse(JSON.stringify([...records])),
            __context__: JSON.parse(JSON.stringify(scriptContext)),
        });

        // Wrap user code in an async IIFE with strict mode
        const wrappedCode = `
            "use strict";
            (function() {
                const records = __records__;
                const context = __context__;
                ${code}
            })();
        `;

        const result = await executeInVm(wrappedCode, vmContext, timeout);

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
 *
 * Uses vm.Script with isolated context for safe execution and hard timeout.
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

    // Pre-compile the script once and reuse for each record
    const wrappedCode = `
        "use strict";
        (function() {
            const record = __record__;
            const index = __index__;
            const context = __context__;
            ${code}
        })();
    `;

    const script = new Script(wrappedCode, {
        filename: 'script-operator.js',
    });

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const scriptContext: ScriptContext = {
            index: i,
            total: records.length,
            data: contextData,
        };

        try {
            // Create a fresh isolated context per record with frozen sandbox globals
            const vmContext = createSafeVmContext({
                ...sandboxGlobals,
                // Deep-copy record and context to prevent cross-boundary mutation
                __record__: JSON.parse(JSON.stringify({ ...record })),
                __index__: i,
                __context__: JSON.parse(JSON.stringify(scriptContext)),
            });

            const result = await script.runInContext(vmContext, {
                timeout,
                breakOnSigint: true,
            });

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
