/**
 * Delivery Utilities
 *
 * Common utilities for all destination handlers to eliminate duplicate
 * error handling and result creation patterns.
 *
 * @module services/destinations
 */

import { DeliveryResult, DestinationType } from './destination.types';
import { getErrorMessage } from '../../utils/error.utils';

/**
 * Create a successful delivery result
 */
export function createSuccessResult(
    destinationId: string,
    destinationType: DestinationType,
    filename: string,
    size: number,
    location: string,
    metadata?: Record<string, unknown>,
): DeliveryResult {
    return {
        success: true,
        destinationId,
        destinationType,
        filename,
        size,
        deliveredAt: new Date(),
        location,
        metadata,
    };
}

/**
 * Create a failure delivery result
 */
export function createFailureResult(
    destinationId: string,
    destinationType: DestinationType,
    filename: string,
    size: number,
    error: string | Error,
): DeliveryResult {
    const errorMessage = getErrorMessage(error);

    return {
        success: false,
        destinationId,
        destinationType,
        filename,
        size,
        error: errorMessage,
    };
}

/**
 * Normalize a remote path by removing duplicate slashes
 */
export function normalizeRemotePath(basePath: string, filename: string): string {
    return `${basePath}/${filename}`.replace(/\/+/g, '/');
}
