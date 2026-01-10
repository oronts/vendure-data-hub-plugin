/**
 * Dashboard Utilities
 * Barrel export for utility functions
 */

// Formatters
export {
    formatValue,
    formatCellValue,
    formatNumber,
    formatPercent,
    formatCurrency,
    formatBytes,
    formatDate,
    formatDateTime,
    formatRelativeTime,
    formatDuration,
    truncate,
    toTitleCase,
    humanize,
    pluralize,
    generateId,
    generateNodeId,
    generateEdgeId,
    generateStepId,
} from './formatters';

// Parsers
export {
    parseCSVLine,
    parseCSV,
    toCSV,
    safeParseJSON,
    parseJSON,
    prettyJSON,
    parseNDJSON,
    toNDJSON,
    parseXML,
    coerceValue,
    coerceRecord,
} from './parsers';

// Validators
export {
    isEmpty,
    isNotEmpty,
    isNumber,
    isInteger,
    isBoolean,
    isEmail,
    isURL,
    matchesPattern,
    hasMinLength,
    hasMaxLength,
    isInRange,
    isGreaterThan,
    isLessThan,
    isPositive,
    isNegative,
    isDate,
    isPastDate,
    isFutureDate,
    isOneOf,
    areUnique,
    hasMinItems,
    hasMaxItems,
    validateRecord,
    validateRecords,
} from './field-validators';

export type {
    ValidationRule,
    ValidationError,
} from './field-validators';

// Step helpers
export {
    STEP_TO_ADAPTER_TYPE,
    FILE_SOURCE_ADAPTERS,
    VENDURE_LOADER_ADAPTERS,
    ADAPTER_FILE_FORMATS,
    getAdapterType,
    stepRequiresAdapter,
    isFileSourceAdapter,
    isVendureLoaderAdapter,
    getTargetSchemaEntity,
    getAcceptedFormats,
    validateStepConfig,
    getAdapterTypeLabel,
    getStepConfig,
} from './step-helpers';

export type { StepValidationResult } from './step-helpers';
