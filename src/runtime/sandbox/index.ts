/**
 * Sandbox Module
 *
 * Secure code execution environment for user-provided expressions.
 */

export {
    SafeEvaluator,
    getDefaultEvaluator,
    createEvaluator,
    safeEvaluate,
    validateExpression,
    ALLOWED_OPERATORS,
    ALLOWED_STRING_METHODS,
    ALLOWED_ARRAY_METHODS,
    ALLOWED_NUMBER_METHODS,
    ALLOWED_METHODS,
    DEFAULT_EVALUATOR_CONFIG,
} from './safe-evaluator';

export type {
    EvaluationResult,
    SafeEvaluatorConfig,
} from './safe-evaluator';
