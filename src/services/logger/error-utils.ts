/**
 * DataHub Logger Error Utilities
 *
 * Utility functions for error extraction and categorization.
 */

import { ErrorDetails, LogMetadata } from './logger.types';

/**
 * Error with cause (ES2022+)
 */
interface ErrorWithCause extends Error {
    cause?: unknown;
}

/**
 * Extract error details from an Error object
 */
export function extractErrorDetails(error: Error | unknown): ErrorDetails {
    if (error instanceof Error) {
        const details: ErrorDetails = {
            message: error.message,
            stack: error.stack,
        };

        // Extract cause if present (Error.cause is ES2022+)
        const errorWithCause = error as ErrorWithCause;
        if (errorWithCause.cause !== undefined) {
            details.cause = extractErrorDetails(errorWithCause.cause);
        }

        // Try to categorize the error
        if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
            details.category = 'timeout';
        } else if (error.message.includes('permission') || error.message.includes('forbidden') || error.message.includes('unauthorized')) {
            details.category = 'permission';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('network')) {
            details.category = 'network';
        } else if (error.message.includes('validation')) {
            details.category = 'validation';
        }

        return details;
    }

    return {
        message: String(error),
        category: 'unknown',
    };
}

// Re-export from canonical location for backwards compatibility
export { getErrorMessage } from '../../utils/error.utils';
