/**
 * Error messages used in API resolvers.
 * Centralizes all resolver error strings for consistency and i18n readiness.
 */
export const RESOLVER_ERROR_MESSAGES = {
    // Connection errors
    CONNECTION_CREATE_FAILED: 'Failed to create connection',
    CONNECTION_UPDATE_FAILED: 'Failed to update connection',
    CONNECTION_NOT_FOUND: 'Connection not found',
    CONNECTION_DELETE_FAILED: 'Failed to delete connection due to an internal error',

    // Secret errors
    SECRET_CREATE_FAILED: 'Failed to create secret',
    SECRET_UPDATE_FAILED: 'Failed to update secret',
    SECRET_NOT_FOUND: 'Secret not found',
    SECRET_DELETE_FAILED: 'Failed to delete secret due to an internal error',

    // Revision errors
    REVISION_NOT_FOUND: 'One or both revisions not found',

    // Sandbox errors
    STEP_NOT_FOUND: (stepKey: string) => `Step ${stepKey} not found in execution results`,

    // AutoMapper errors
    INVALID_AUTOMAPPER_CONFIG: (errors: string[]) => `Invalid AutoMapper configuration: ${errors.join(', ')}`,

    // Settings errors
    INVALID_RETENTION_DAYS: (field: string, minimum: number, maximum: number) =>
        `${field} must be an integer between ${minimum} and ${maximum}`,
    INVALID_LOG_PERSISTENCE_LEVEL: (value: string) =>
        `Unsupported log persistence level: ${value}`,
} as const;
