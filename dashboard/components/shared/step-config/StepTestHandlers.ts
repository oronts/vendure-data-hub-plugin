import {
    previewExtract,
    simulateTransform,
    simulateLoad,
    simulateValidate,
    previewFeed,
} from '../../../hooks';
import { STEP_TYPES } from '../../../constants';

/**
 * Result from running a step test
 */
export interface TestResult {
    status: 'success' | 'error' | 'warning';
    message?: string;
    data?: unknown;
    records?: Array<Record<string, unknown>>;
    beforeAfter?: Array<{ before: Record<string, unknown>; after: Record<string, unknown> }>;
    feedContent?: { content: string; contentType: string; itemCount: number };
    loadSimulation?: Record<string, unknown>;
}

/**
 * Options for running step tests
 */
export interface StepTestOptions {
    config: Record<string, unknown>;
    sampleInput?: string;
    limit?: number;
}

/**
 * Parse sample input JSON, returning records or throwing an error
 */
export function parseSampleInput(sampleInput: string): Array<Record<string, unknown>> {
    const inputRecords = JSON.parse(sampleInput);
    if (!Array.isArray(inputRecords)) {
        throw new Error('Input must be a JSON array');
    }
    return inputRecords;
}

/**
 * Test an EXTRACT step by running the extractor and returning sample records
 */
export async function testExtractStep(options: StepTestOptions): Promise<TestResult> {
    const { config, limit = 10 } = options;

    const records = await previewExtract(config || {}, limit);

    return {
        status: records.length > 0 ? 'success' : 'warning',
        message: records.length > 0
            ? `Extracted ${records.length} record(s)`
            : 'No records extracted. Check your extractor configuration.',
        records: records as Array<Record<string, unknown>>,
    };
}

/**
 * Test a TRANSFORM step by applying transformations to sample records
 */
export async function testTransformStep(options: StepTestOptions): Promise<TestResult> {
    const { config, sampleInput = '[]' } = options;

    let inputRecords: Array<Record<string, unknown>>;
    try {
        inputRecords = parseSampleInput(sampleInput);
    } catch (e) {
        return {
            status: 'error',
            message: `Invalid sample input: ${e instanceof Error ? e.message : 'Parse error'}`,
        };
    }

    const outputRecords = await simulateTransform(config || {}, inputRecords);

    const beforeAfter = inputRecords.map((before, idx) => ({
        before,
        after: outputRecords[idx] ?? {},
    }));

    return {
        status: 'success',
        message: `Transformed ${inputRecords.length} record(s)`,
        records: outputRecords,
        beforeAfter,
    };
}

/**
 * Test a VALIDATE step by running validation rules on sample records
 */
export async function testValidateStep(options: StepTestOptions): Promise<TestResult> {
    const { config, sampleInput = '[]' } = options;

    let inputRecords: Array<Record<string, unknown>>;
    try {
        inputRecords = parseSampleInput(sampleInput);
    } catch (e) {
        return {
            status: 'error',
            message: `Invalid sample input: ${e instanceof Error ? e.message : 'Parse error'}`,
        };
    }

    const validateResult = await simulateValidate(config || {}, inputRecords);
    const outputRecords = (validateResult?.records ?? []) as Array<Record<string, unknown>>;
    const summary = validateResult?.summary;

    return {
        status: summary?.failed ? 'warning' : 'success',
        message: summary
            ? `Validation: ${summary.passed}/${summary.input} passed (${summary.passRate}%)`
            : `Validated ${outputRecords.length} record(s)`,
        records: outputRecords,
        data: summary ? { validationSummary: summary } : undefined,
    };
}

/**
 * Test a LOAD step by simulating the load operation (no actual database changes)
 */
export async function testLoadStep(options: StepTestOptions): Promise<TestResult> {
    const { config, sampleInput = '[]' } = options;

    let inputRecords: Array<Record<string, unknown>>;
    try {
        inputRecords = parseSampleInput(sampleInput);
    } catch (e) {
        return {
            status: 'error',
            message: `Invalid sample input: ${e instanceof Error ? e.message : 'Parse error'}`,
        };
    }

    const simulation = await simulateLoad(config || {}, inputRecords);

    return {
        status: 'success',
        message: 'Load simulation completed',
        loadSimulation: simulation,
        records: inputRecords,
    };
}

/**
 * Test a FEED step by generating feed output
 */
export async function testFeedStep(options: StepTestOptions): Promise<TestResult> {
    const { config, limit = 10 } = options;

    const feedConfig = config as { code?: string; feedCode?: string };
    const feedCode = String(feedConfig.code || feedConfig.feedCode || '');

    if (!feedCode) {
        return {
            status: 'error',
            message: 'No feed code configured. Set the feed code in step configuration.',
        };
    }

    const feed = await previewFeed(feedCode, limit);

    if (feed) {
        return {
            status: 'success',
            message: `Feed preview: ${feed.itemCount} item(s)`,
            feedContent: {
                content: feed.content ?? '',
                contentType: feed.contentType ?? 'text/plain',
                itemCount: feed.itemCount ?? 0,
            },
        };
    }

    return {
        status: 'warning',
        message: 'No feed content returned',
    };
}

/**
 * Get a result for TRIGGER steps (cannot be tested directly)
 */
export function getTriggerStepResult(config: Record<string, unknown>): TestResult {
    const triggerConfig = config as { type?: string };
    return {
        status: 'success',
        message: 'Trigger steps cannot be tested directly. Run a full pipeline dry run instead.',
        data: {
            triggerType: triggerConfig.type || 'unknown',
            config: config,
        },
    };
}

/**
 * Get a result for EXPORT/SINK steps (cannot be tested directly)
 */
export function getOutputStepResult(effectiveType: string, config: Record<string, unknown>): TestResult {
    return {
        status: 'success',
        message: `${effectiveType} steps write to external destinations. Use the full pipeline dry run to test.`,
        data: { config },
    };
}

/**
 * Get a result for unknown step types
 */
export function getUnknownStepResult(effectiveType: string): TestResult {
    return {
        status: 'warning',
        message: `Unknown step type: ${effectiveType}`,
    };
}

/**
 * Run a test for a step based on its type
 */
export async function runStepTest(
    effectiveType: string,
    options: StepTestOptions
): Promise<TestResult> {
    try {
        switch (effectiveType) {
            case STEP_TYPES.EXTRACT:
                return await testExtractStep(options);

            case STEP_TYPES.TRANSFORM:
                return await testTransformStep(options);

            case STEP_TYPES.VALIDATE:
                return await testValidateStep(options);

            case STEP_TYPES.LOAD:
                return await testLoadStep(options);

            case STEP_TYPES.FEED:
                return await testFeedStep(options);

            case STEP_TYPES.TRIGGER:
                return getTriggerStepResult(options.config);

            case STEP_TYPES.EXPORT:
            case STEP_TYPES.SINK:
                return getOutputStepResult(effectiveType, options.config);

            default:
                return getUnknownStepResult(effectiveType);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            status: 'error',
            message: message.includes('GraphQL')
                ? 'API endpoint not available. Make sure the server is running.'
                : message,
        };
    }
}

/**
 * Check if a step type supports direct testing
 */
export function canTestStepType(effectiveType: string): boolean {
    return [
        STEP_TYPES.EXTRACT,
        STEP_TYPES.TRANSFORM,
        STEP_TYPES.VALIDATE,
        STEP_TYPES.LOAD,
        STEP_TYPES.FEED,
    ].includes(effectiveType as typeof STEP_TYPES[keyof typeof STEP_TYPES]);
}
