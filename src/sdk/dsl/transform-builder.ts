import { collectionTransformOperators } from './transform-builder.collection';
import { controlTransformOperators } from './transform-builder.control';
import { recordTransformOperators } from './transform-builder.record';

/**
 * Typed builders for the built-in transform operators.
 *
 * Each builder validates the operator-specific contract and snapshots mutable
 * inputs so subsequent caller mutations cannot alter a pipeline definition.
 */
export const operators = {
    ...recordTransformOperators,
    ...controlTransformOperators,
    ...collectionTransformOperators,
};
