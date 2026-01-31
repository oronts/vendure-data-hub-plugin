/**
 * Validation mode options for pipeline validation steps.
 * Controls how invalid records are handled during processing.
 */
export const VALIDATION_MODES = [
    { value: 'strict', label: 'Strict - Reject invalid records' },
    { value: 'lenient', label: 'Lenient - Allow with warnings' },
] as const;

export type ValidationMode = typeof VALIDATION_MODES[number]['value'];

/**
 * Error handling mode options for pipeline steps.
 * Controls whether processing stops on first error or collects all errors.
 */
export const ERROR_HANDLING_MODES = [
    { value: 'fail-fast', label: 'Fail Fast - Stop on first error' },
    { value: 'accumulate', label: 'Accumulate - Collect all errors' },
] as const;

export type ErrorHandlingMode = typeof ERROR_HANDLING_MODES[number]['value'];

/**
 * Default values for route step branch configuration.
 */
export const ROUTE_BRANCH_DEFAULTS = {
    /** Prefix for auto-generated branch names */
    namePrefix: 'branch-',
    /** Maximum number of branches allowed per route step */
    maxBranches: 10,
} as const;
