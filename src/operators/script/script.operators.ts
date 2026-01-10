/**
 * Script Operator Implementation
 *
 * Allows inline JavaScript code for complex transformations.
 */

import { JsonObject } from '../../types';
import { OperatorHelpers, AdapterDefinition } from '../../sdk/types';
import { OperatorResult } from '../types';
import { ScriptOperatorConfig, ScriptContext } from './types';

const DEFAULT_TIMEOUT = 5000;

/**
 * Script operator definition
 */
export const SCRIPT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'script',
    name: 'Script',
    description: 'Execute inline JavaScript code to transform records. Use for complex logic that cannot be expressed with standard operators.',
    category: 'transformation',
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
 * Create sandboxed globals for script execution
 */
function createSandboxGlobals(): Record<string, any> {
    return {
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        JSON,
        Math,
        RegExp,
        Map,
        Set,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        console: {
            log: () => {},
            warn: () => {},
            error: () => {},
        },
    };
}

/**
 * Execute script with timeout
 */
async function executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeout: number,
): Promise<T> {
    return Promise.race([
        Promise.resolve(fn()),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Script timeout after ${timeout}ms`)), timeout),
        ),
    ]);
}

/**
 * Script operator - execute inline JavaScript code
 */
export function scriptOperator(
    records: readonly JsonObject[],
    config: ScriptOperatorConfig,
    _helpers: OperatorHelpers,
): OperatorResult | Promise<OperatorResult> {
    const { code, batch, timeout = DEFAULT_TIMEOUT, failOnError, context: contextData } = config;

    if (!code || typeof code !== 'string') {
        return { records: [...records], errors: [{ message: 'Script code is required' }] };
    }

    const sandboxGlobals = createSandboxGlobals();

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
    sandboxGlobals: Record<string, any>,
): Promise<OperatorResult> {
    const scriptContext: ScriptContext = {
        total: records.length,
        data: contextData,
    };

    // Include records and context in the function parameters
    const fnBody = `
        "use strict";
        return (async function(records, context) {
            ${code}
        })(__records__, __context__);
    `;

    try {
        const fn = new Function(
            ...Object.keys(sandboxGlobals),
            '__records__',
            '__context__',
            fnBody,
        );
        const result = await executeWithTimeout(
            () => fn(...Object.values(sandboxGlobals), [...records], scriptContext),
            timeout,
        );

        if (!Array.isArray(result)) {
            throw new Error('Batch script must return an array of records');
        }

        return { records: result };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
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
    sandboxGlobals: Record<string, any>,
): Promise<OperatorResult> {
    const results: JsonObject[] = [];
    const errors: Array<{ message: string; field?: string }> = [];

    // Include record, index, and context in the function parameters
    const fnBody = `
        "use strict";
        return (async function(record, index, context) {
            ${code}
        })(__record__, __index__, __context__);
    `;

    const fn = new Function(
        ...Object.keys(sandboxGlobals),
        '__record__',
        '__index__',
        '__context__',
        fnBody,
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
                () => fn(...Object.values(sandboxGlobals), { ...record }, i, scriptContext),
                timeout,
            );

            // null means filter out this record
            if (result === null || result === undefined) {
                continue;
            }

            if (typeof result !== 'object' || Array.isArray(result)) {
                throw new Error('Script must return an object or null');
            }

            results.push(result as JsonObject);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
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
