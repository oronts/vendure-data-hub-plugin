/**
 * Adapter Utilities
 *
 * Helper functions used by adapters.
 * Re-exports from base/adapter-helpers.ts for convenience.
 */

export {
    FilterCondition,
    getFieldValue,
    setFieldValue,
    evaluateFilterCondition,
    isCompatibleType,
    slugify,
    escapeCSV,
    chunkArray,
    deduplicateRecords,
    isEmpty,
    validateRequiredFields,
} from './base/adapter-helpers';

// Alias for convenience
export { evaluateFilterCondition as evaluateCondition } from './base/adapter-helpers';
