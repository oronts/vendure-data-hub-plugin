/**
 * Error messages used in API resolvers.
 * Centralizes all resolver error strings for consistency and i18n readiness.
 */
export const RESOLVER_ERROR_MESSAGES = {
    // Connection errors
    CONNECTION_CREATE_FAILED: 'Failed to create connection',
    CONNECTION_UPDATE_FAILED: 'Failed to update connection',

    // Secret errors
    SECRET_CREATE_FAILED: 'Failed to create secret',
    SECRET_UPDATE_FAILED: 'Failed to update secret',

    // Revision errors
    REVISION_NOT_FOUND: 'One or both revisions not found',

    // Sandbox errors
    STEP_NOT_FOUND: (stepKey: string) => `Step ${stepKey} not found in execution results`,

    // AutoMapper errors
    INVALID_AUTOMAPPER_CONFIG: (errors: string[]) => `Invalid AutoMapper configuration: ${errors.join(', ')}`,
} as const;
