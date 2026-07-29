import {
    previewExtract,
    simulateTransform,
    simulateLoad,
    simulateValidate,
} from '../../../hooks';
import { STEP_CONFIG_TRANSLATION_IDS, STEP_TYPE } from '../../../constants';
import { getErrorMessage } from '../../../../shared';
import { getFeedStepTestResult } from './step-test-capabilities';
import type { TestResult } from './step-test-types';

export { canTestStepType } from './step-test-capabilities';
export type { TestResult, TestResultMessage } from './step-test-types';

/**
 * Options for running step tests
 */
export interface StepTestOptions {
    config: Record<string, unknown>;
    schemaRef?: { schemaId: string; version: string };
    sampleInput?: string;
    limit?: number;
}

/**
 * Parse sample input JSON, returning records or throwing an error
 */
class StepTestInputError extends Error {
    constructor(readonly messageId: string) {
        super(messageId);
    }
}

function parseSampleInput(sampleInput: string): Array<Record<string, unknown>> {
    let inputRecords: unknown;
    try {
        inputRecords = JSON.parse(sampleInput);
    } catch {
        throw new StepTestInputError(STEP_CONFIG_TRANSLATION_IDS.INVALID_JSON_ARRAY);
    }
    if (!Array.isArray(inputRecords)) {
        throw new StepTestInputError(
            STEP_CONFIG_TRANSLATION_IDS.INPUT_MUST_BE_JSON_ARRAY,
        );
    }
    if (
        inputRecords.some(
            (record) =>
                record === null ||
                typeof record !== 'object' ||
                Array.isArray(record),
        )
    ) {
        throw new StepTestInputError(
            STEP_CONFIG_TRANSLATION_IDS.EACH_INPUT_RECORD_MUST_BE_OBJECT,
        );
    }
    return inputRecords as Array<Record<string, unknown>>;
}

/**
 * Test an EXTRACT step by running the extractor and returning sample records
 */
async function testExtractStep(options: StepTestOptions): Promise<TestResult> {
    const { config, schemaRef, limit = 10 } = options;

    const records = await previewExtract({ config, schemaRef }, limit);

    return {
        status: records.length > 0 ? 'success' : 'warning',
        message: records.length > 0
            ? {
                id: STEP_CONFIG_TRANSLATION_IDS.EXTRACTED_RECORDS,
                values: { count: records.length },
            }
            : { id: STEP_CONFIG_TRANSLATION_IDS.NO_RECORDS_EXTRACTED },
        records: records as Array<Record<string, unknown>>,
    };
}

/**
 * Test a TRANSFORM step by applying transformations to sample records
 */
async function testTransformStep(
    options: StepTestOptions,
): Promise<TestResult> {
    const { config, sampleInput = '[]' } = options;

    let inputRecords: Array<Record<string, unknown>>;
    try {
        inputRecords = parseSampleInput(sampleInput);
    } catch (e) {
        return {
            status: 'error',
            message: e instanceof StepTestInputError
                ? { id: e.messageId }
                : {
                    id: STEP_CONFIG_TRANSLATION_IDS.INVALID_SAMPLE_INPUT,
                    values: { error: getErrorMessage(e) },
                },
        };
    }

    const outputRecords = await simulateTransform({ config }, inputRecords);

    const beforeAfter = inputRecords.map((before, idx) => ({
        before,
        after: outputRecords[idx] ?? {},
    }));

    return {
        status: 'success',
        message: {
            id: STEP_CONFIG_TRANSLATION_IDS.TRANSFORMED_RECORDS,
            values: { count: inputRecords.length },
        },
        records: outputRecords,
        beforeAfter,
    };
}

/**
 * Test a VALIDATE step by running validation rules on sample records
 */
async function testValidateStep(options: StepTestOptions): Promise<TestResult> {
    const { config, schemaRef, sampleInput = '[]' } = options;

    let inputRecords: Array<Record<string, unknown>>;
    try {
        inputRecords = parseSampleInput(sampleInput);
    } catch (e) {
        return {
            status: 'error',
            message: e instanceof StepTestInputError
                ? { id: e.messageId }
                : {
                    id: STEP_CONFIG_TRANSLATION_IDS.INVALID_SAMPLE_INPUT,
                    values: { error: getErrorMessage(e) },
                },
        };
    }

    const validateResult = await simulateValidate({ config, schemaRef }, inputRecords);
    const outputRecords = (validateResult?.records ?? []) as Array<
        Record<string, unknown>
    >;
    const summary = validateResult?.summary;

    return {
        status: summary?.failed ? 'warning' : 'success',
        message: summary
            ? {
                id: STEP_CONFIG_TRANSLATION_IDS.VALIDATION_SUMMARY,
                values: {
                    passed: summary.passed,
                    input: summary.input,
                    passRate: summary.passRate,
                },
            }
            : {
                id: STEP_CONFIG_TRANSLATION_IDS.VALIDATED_RECORDS,
                values: { count: outputRecords.length },
            },
        records: outputRecords,
        data: summary ? { validationSummary: summary } : undefined,
    };
}

/**
 * Test a LOAD step by simulating the load operation (no actual database changes)
 */
async function testLoadStep(options: StepTestOptions): Promise<TestResult> {
    const { config, sampleInput = '[]' } = options;

    let inputRecords: Array<Record<string, unknown>>;
    try {
        inputRecords = parseSampleInput(sampleInput);
    } catch (e) {
        return {
            status: 'error',
            message: e instanceof StepTestInputError
                ? { id: e.messageId }
                : {
                    id: STEP_CONFIG_TRANSLATION_IDS.INVALID_SAMPLE_INPUT,
                    values: { error: getErrorMessage(e) },
                },
        };
    }

    const simulation = await simulateLoad({ config }, inputRecords);

    return {
        status: 'success',
        message: { id: STEP_CONFIG_TRANSLATION_IDS.LOAD_SIMULATION_COMPLETED },
        loadSimulation: simulation,
        records: inputRecords,
    };
}

/**
 * Get a result for TRIGGER steps (cannot be tested directly)
 */
function getTriggerStepResult(config: Record<string, unknown>): TestResult {
    const triggerConfig = config as { type?: string };
    return {
        status: 'success',
        message: { id: STEP_CONFIG_TRANSLATION_IDS.TRIGGER_PIPELINE_DRY_RUN },
        data: {
            triggerType: triggerConfig.type || 'unknown',
            config: config,
        },
    };
}

/**
 * Get a result for EXPORT/SINK steps (cannot be tested directly)
 */
function getOutputStepResult(
    effectiveType: string,
    config: Record<string, unknown>,
): TestResult {
    return {
        status: 'success',
        message: {
            id: STEP_CONFIG_TRANSLATION_IDS.OUTPUT_PIPELINE_DRY_RUN,
            values: { type: effectiveType },
        },
        data: { config },
    };
}

/**
 * Get a result for unknown step types
 */
function getUnknownStepResult(effectiveType: string): TestResult {
    return {
        status: 'warning',
        message: {
            id: STEP_CONFIG_TRANSLATION_IDS.UNKNOWN_STEP_TYPE,
            values: { type: effectiveType },
        },
    };
}

/**
 * Run a test for a step based on its type
 */
export async function runStepTest(
    effectiveType: string,
    options: StepTestOptions,
): Promise<TestResult> {
    try {
        switch (effectiveType) {
            case STEP_TYPE.EXTRACT:
                return await testExtractStep(options);

            case STEP_TYPE.TRANSFORM:
                return await testTransformStep(options);

            case STEP_TYPE.VALIDATE:
                return await testValidateStep(options);

            case STEP_TYPE.LOAD:
                return await testLoadStep(options);

            case STEP_TYPE.FEED:
                return getFeedStepTestResult();

            case STEP_TYPE.TRIGGER:
                return getTriggerStepResult(options.config);

            case STEP_TYPE.EXPORT:
            case STEP_TYPE.SINK:
                return getOutputStepResult(effectiveType, options.config);

            case STEP_TYPE.ENRICH:
                return {
                    status: 'success',
                    message: {
                        id: STEP_CONFIG_TRANSLATION_IDS.ENRICH_PIPELINE_DRY_RUN,
                    },
                    data: { config: options.config },
                };

            case STEP_TYPE.ROUTE:
                return {
                    status: 'success',
                    message: {
                        id: STEP_CONFIG_TRANSLATION_IDS.ROUTE_PIPELINE_DRY_RUN,
                    },
                    data: { config: options.config },
                };

            case STEP_TYPE.GATE:
                return {
                    status: 'success',
                    message: {
                        id: STEP_CONFIG_TRANSLATION_IDS.GATE_TEST_UNSUPPORTED,
                    },
                    data: { config: options.config },
                };

            default:
                return getUnknownStepResult(effectiveType);
        }
    } catch (err) {
        const message = getErrorMessage(err);
        return {
            status: 'error',
            message: message.includes('GraphQL')
                ? { id: STEP_CONFIG_TRANSLATION_IDS.API_ENDPOINT_UNAVAILABLE }
                : { text: message },
        };
    }
}
