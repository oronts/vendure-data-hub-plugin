/**
 * Delivery Utilities
 *
 * Common utilities for all destination handlers to eliminate duplicate
 * error handling and result creation patterns.
 *
 * @module services/destinations
 */

import { DeliveryResult, DestinationType, DeliveryOptions } from './destination.types';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubLogger } from '../logger';

const logger = new DataHubLogger(LOGGER_CONTEXTS.DELIVERY_UTILS);

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
    const errorMessage = error instanceof Error ? error.message : error;

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
 * Execute a delivery operation with standardized error handling
 */
export async function executeDelivery<TConfig extends { id: string }>(
    config: TConfig,
    destinationType: DestinationType,
    content: Buffer,
    filename: string,
    deliveryFn: () => Promise<DeliveryResult>,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    try {
        return await deliveryFn();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
            `${destinationType.toUpperCase()}: Failed to deliver ${filename}`,
            error instanceof Error ? error : undefined,
        );

        return createFailureResult(
            config.id,
            destinationType,
            filename,
            content.length,
            errorMessage,
        );
    }
}

/**
 * Connection test result helper
 */
export interface ConnectionTestContext {
    startTime: number;
}

/**
 * Start a connection test
 */
export function startConnectionTest(): ConnectionTestContext {
    return { startTime: Date.now() };
}

/**
 * Create a successful connection test result
 */
export function createTestSuccess(
    context: ConnectionTestContext,
    message: string,
): { success: true; message: string; latencyMs: number } {
    return {
        success: true,
        message,
        latencyMs: Date.now() - context.startTime,
    };
}

/**
 * Create a failed connection test result
 */
export function createTestFailure(
    context: ConnectionTestContext,
    error: unknown,
): { success: false; message: string; latencyMs: number } {
    return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
        latencyMs: Date.now() - context.startTime,
    };
}

/**
 * Extract error message from unknown error
 */
export function extractErrorMessage(error: unknown, defaultMessage: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    return defaultMessage;
}

/**
 * Normalize a remote path by removing duplicate slashes
 */
export function normalizeRemotePath(basePath: string, filename: string): string {
    return `${basePath}/${filename}`.replace(/\/+/g, '/');
}

/**
 * Get MIME type with fallback
 */
export function getMimeType(options?: DeliveryOptions): string {
    return options?.mimeType || 'application/octet-stream';
}
