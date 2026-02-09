/**
 * Operation domain enums - Load strategies, conflict resolution, and entity operations
 */

/**
 * Load strategies for entity loaders
 */
export const LoadStrategy = {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    UPSERT: "UPSERT",
    MERGE: "MERGE",
    SOFT_DELETE: "SOFT_DELETE",
    HARD_DELETE: "HARD_DELETE",
} as const;
export type LoadStrategy = typeof LoadStrategy[keyof typeof LoadStrategy];

/**
 * Conflict resolution strategies
 */
export const ConflictStrategy = {
    SOURCE_WINS: "SOURCE_WINS",
    VENDURE_WINS: "VENDURE_WINS",
    MERGE: "MERGE",
    MANUAL_QUEUE: "MANUAL_QUEUE",
} as const;
export type ConflictStrategy = typeof ConflictStrategy[keyof typeof ConflictStrategy];

/**
 * Channel assignment strategies
 */
export const ChannelStrategy = {
    EXPLICIT: "EXPLICIT",
    INHERIT: "INHERIT",
    MULTI: "MULTI",
} as const;
export type ChannelStrategy = typeof ChannelStrategy[keyof typeof ChannelStrategy];

/**
 * Language handling strategies
 */
export const LanguageStrategy = {
    SPECIFIC: "SPECIFIC",
    FALLBACK: "FALLBACK",
    MULTI: "MULTI",
} as const;
export type LanguageStrategy = typeof LanguageStrategy[keyof typeof LanguageStrategy];

/**
 * Load operation types for entity loaders
 *
 * Values use SCREAMING_SNAKE_CASE to match operation type conventions
 */
export enum LoadOperationType {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    UPSERT = 'UPSERT',
}

/**
 * Outcome types for operation results
 *
 * Values use SCREAMING_SNAKE_CASE to match status conventions
 */
export enum OutcomeType {
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
    PARTIAL = 'PARTIAL',
}

/**
 * Change types for record tracking
 *
 * Values use SCREAMING_SNAKE_CASE to match status conventions
 */
export enum ChangeType {
    CREATED = 'CREATED',
    UPDATED = 'UPDATED',
    DELETED = 'DELETED',
    UNCHANGED = 'UNCHANGED',
}

/**
 * Target operation constants for entity loaders
 * Use these constants instead of string literals for type safety
 */
export const TARGET_OPERATION = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    UPSERT: 'UPSERT',
    MERGE: 'MERGE',
    DELETE: 'DELETE',
} as const;

/**
 * Outcome types for loader record processing
 */
export const OUTCOME_TYPE = {
    SKIP: 'skip',
    ERROR: 'error',
    CONTINUE: 'continue',
} as const;
export type LoaderOutcomeType = typeof OUTCOME_TYPE[keyof typeof OUTCOME_TYPE];

/**
 * Rollback operation types
 *
 * Values use SCREAMING_SNAKE_CASE to match operation type conventions
 */
export enum RollbackOperationType {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
}

/**
 * Export destination types for file/data delivery
 * Use these constants instead of hardcoded string literals
 */
export const DESTINATION_TYPE = {
    FILE: 'FILE',
    S3: 'S3',
    FTP: 'FTP',
    SFTP: 'SFTP',
    HTTP: 'HTTP',
    EMAIL: 'EMAIL',
    WEBHOOK: 'WEBHOOK',
    LOCAL: 'LOCAL',
} as const;

export type DestinationType = typeof DESTINATION_TYPE[keyof typeof DESTINATION_TYPE];

