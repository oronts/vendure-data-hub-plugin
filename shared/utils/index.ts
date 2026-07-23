/**
 * Shared Utilities
 *
 * Common utility functions that can be used by both backend (src/)
 * and frontend (dashboard/) code.
 */

export * from './validation';
export { getErrorMessage, ensureError, toErrorOrUndefined } from './error';
export { screamingSnakeToKebab, kebabToScreamingSnake } from './string-case';
export { getNestedValue, setNestedValue } from './object-path';
export { parseCSVLine } from './csv-parse';
