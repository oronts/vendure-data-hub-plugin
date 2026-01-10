// ERROR CODES - Standardized error codes for DataHub operations

/**
 * Error codes for pipeline execution errors
 */
export enum PipelineErrorCode {
    // General errors
    UNKNOWN = 'PIPELINE_UNKNOWN_ERROR',
    CANCELLED = 'PIPELINE_CANCELLED',
    TIMEOUT = 'PIPELINE_TIMEOUT',

    // Definition errors
    INVALID_DEFINITION = 'PIPELINE_INVALID_DEFINITION',
    MISSING_STEP = 'PIPELINE_MISSING_STEP',
    INVALID_STEP_TYPE = 'PIPELINE_INVALID_STEP_TYPE',
    CIRCULAR_DEPENDENCY = 'PIPELINE_CIRCULAR_DEPENDENCY',

    // Execution errors
    STEP_FAILED = 'PIPELINE_STEP_FAILED',
    ADAPTER_NOT_FOUND = 'PIPELINE_ADAPTER_NOT_FOUND',
    CONNECTION_FAILED = 'PIPELINE_CONNECTION_FAILED',
}

/**
 * Error codes for extractor operations
 */
export enum ExtractorErrorCode {
    // Connection errors
    CONNECTION_REFUSED = 'EXTRACTOR_CONNECTION_REFUSED',
    CONNECTION_TIMEOUT = 'EXTRACTOR_CONNECTION_TIMEOUT',
    AUTHENTICATION_FAILED = 'EXTRACTOR_AUTH_FAILED',

    // Data errors
    PARSE_ERROR = 'EXTRACTOR_PARSE_ERROR',
    INVALID_FORMAT = 'EXTRACTOR_INVALID_FORMAT',
    EMPTY_RESPONSE = 'EXTRACTOR_EMPTY_RESPONSE',

    // HTTP errors
    HTTP_CLIENT_ERROR = 'EXTRACTOR_HTTP_4XX',
    HTTP_SERVER_ERROR = 'EXTRACTOR_HTTP_5XX',
    RATE_LIMITED = 'EXTRACTOR_RATE_LIMITED',

    // File errors
    FILE_NOT_FOUND = 'EXTRACTOR_FILE_NOT_FOUND',
    FILE_TOO_LARGE = 'EXTRACTOR_FILE_TOO_LARGE',
    UNSUPPORTED_FORMAT = 'EXTRACTOR_UNSUPPORTED_FORMAT',
}

/**
 * Error codes for loader operations
 */
export enum LoaderErrorCode {
    // Validation errors
    VALIDATION_FAILED = 'LOADER_VALIDATION_FAILED',
    MISSING_REQUIRED_FIELD = 'LOADER_MISSING_FIELD',
    INVALID_FIELD_TYPE = 'LOADER_INVALID_TYPE',
    CONSTRAINT_VIOLATION = 'LOADER_CONSTRAINT_VIOLATION',

    // Entity errors
    ENTITY_NOT_FOUND = 'LOADER_ENTITY_NOT_FOUND',
    DUPLICATE_ENTITY = 'LOADER_DUPLICATE_ENTITY',
    FOREIGN_KEY_ERROR = 'LOADER_FK_ERROR',

    // Permission errors
    PERMISSION_DENIED = 'LOADER_PERMISSION_DENIED',
    CHANNEL_MISMATCH = 'LOADER_CHANNEL_MISMATCH',
}

/**
 * Error codes for transformation operations
 */
export enum TransformErrorCode {
    // Expression errors
    INVALID_EXPRESSION = 'TRANSFORM_INVALID_EXPRESSION',
    EXPRESSION_EVAL_FAILED = 'TRANSFORM_EVAL_FAILED',

    // Mapping errors
    MAPPING_FAILED = 'TRANSFORM_MAPPING_FAILED',
    FIELD_NOT_FOUND = 'TRANSFORM_FIELD_NOT_FOUND',

    // Type errors
    TYPE_COERCION_FAILED = 'TRANSFORM_TYPE_COERCION_FAILED',
    INVALID_VALUE = 'TRANSFORM_INVALID_VALUE',
}

/**
 * Error codes for webhook/hook operations
 */
export enum WebhookErrorCode {
    DELIVERY_FAILED = 'WEBHOOK_DELIVERY_FAILED',
    TIMEOUT = 'WEBHOOK_TIMEOUT',
    INVALID_RESPONSE = 'WEBHOOK_INVALID_RESPONSE',
    MAX_RETRIES_EXCEEDED = 'WEBHOOK_MAX_RETRIES',
    SIGNATURE_MISMATCH = 'WEBHOOK_SIGNATURE_MISMATCH',
}

/**
 * Error codes for connection operations
 */
export enum ConnectionErrorCode {
    NOT_FOUND = 'CONNECTION_NOT_FOUND',
    INVALID_CONFIG = 'CONNECTION_INVALID_CONFIG',
    SECRET_NOT_FOUND = 'CONNECTION_SECRET_NOT_FOUND',
    TEST_FAILED = 'CONNECTION_TEST_FAILED',
}

/**
 * Error codes for schema validation
 */
export enum SchemaErrorCode {
    SCHEMA_NOT_FOUND = 'SCHEMA_NOT_FOUND',
    VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
    INCOMPATIBLE_VERSION = 'SCHEMA_INCOMPATIBLE_VERSION',
    INVALID_DEFINITION = 'SCHEMA_INVALID_DEFINITION',
}

/**
 * All error codes combined for lookup
 */
export const ERROR_CODES = {
    ...PipelineErrorCode,
    ...ExtractorErrorCode,
    ...LoaderErrorCode,
    ...TransformErrorCode,
    ...WebhookErrorCode,
    ...ConnectionErrorCode,
    ...SchemaErrorCode,
} as const;

/**
 * Error severity levels
 */
export enum ErrorSeverity {
    /** Informational - not an error */
    INFO = 'info',
    /** Warning - operation succeeded but with issues */
    WARNING = 'warning',
    /** Error - operation failed but may be retried */
    ERROR = 'error',
    /** Critical - operation failed and cannot be recovered */
    CRITICAL = 'critical',
}

/**
 * Determines if an error is retryable based on its code
 */
export function isRetryableError(code: string): boolean {
    const retryableCodes: Set<string> = new Set([
        ExtractorErrorCode.CONNECTION_TIMEOUT,
        ExtractorErrorCode.HTTP_SERVER_ERROR,
        ExtractorErrorCode.RATE_LIMITED,
        WebhookErrorCode.DELIVERY_FAILED,
        WebhookErrorCode.TIMEOUT,
    ]);

    return retryableCodes.has(code);
}

/**
 * Gets the severity level for an error code
 */
export function getErrorSeverity(code: string): ErrorSeverity {
    const criticalCodes: Set<string> = new Set([
        PipelineErrorCode.INVALID_DEFINITION,
        PipelineErrorCode.CIRCULAR_DEPENDENCY,
        SchemaErrorCode.INCOMPATIBLE_VERSION,
    ]);

    if (criticalCodes.has(code)) {
        return ErrorSeverity.CRITICAL;
    }

    if (code.includes('VALIDATION') || code.includes('MISSING')) {
        return ErrorSeverity.WARNING;
    }

    return ErrorSeverity.ERROR;
}
