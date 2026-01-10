/**
 * Validation Helper Functions
 *
 * Shared utilities for validation operations.
 */

import {
    StepValidationResult,
    StepValidationError,
    StepValidationWarning,
    PipelineValidationError,
    PipelineValidationWarning,
} from './types';

// STEP VALIDATION HELPERS

/**
 * Create a step validation error
 */
export function createStepError(
    field: string,
    message: string,
    errorCode: string,
): StepValidationError {
    return { field, message, errorCode };
}

/**
 * Create a step validation warning
 */
export function createStepWarning(
    field: string,
    message: string,
): StepValidationWarning {
    return { field, message };
}

/**
 * Combine multiple step validation results
 */
export function combineStepResults(...results: StepValidationResult[]): StepValidationResult {
    return {
        valid: results.every(r => r.valid),
        errors: results.flatMap(r => r.errors),
        warnings: results.flatMap(r => r.warnings),
    };
}

// PIPELINE VALIDATION HELPERS

/**
 * Create a pipeline validation error
 */
export function createPipelineError(
    field: string,
    message: string,
    errorCode: string,
): PipelineValidationError {
    return { field, message, errorCode };
}

/**
 * Create a pipeline validation warning
 */
export function createPipelineWarning(
    field: string,
    message: string,
): PipelineValidationWarning {
    return { field, message };
}
