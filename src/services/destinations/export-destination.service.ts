import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

import type { ConnectionTestResult } from '../../../shared/types';
import {
    DestinationType,
    DestinationConfig,
    DeliveryResult,
    DeliveryOptions,
    DESTINATION_TYPE,
} from './destination.types';
import { DESTINATION_DELIVERY_REGISTRY, DESTINATION_TEST_REGISTRY } from './destination-handler-registry';
import { getErrorMessage } from '../../utils/error.utils';

export type { DestinationType, DestinationConfig, DeliveryResult };
export type {
    S3DestinationConfig,
    SFTPDestinationConfig,
    FTPDestinationConfig,
    HTTPDestinationConfig,
    LocalDestinationConfig,
    EmailDestinationConfig,
} from './destination.types';

const MAX_EXPORT_DESTINATIONS = 100;

@Injectable()
export class ExportDestinationService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private destinations: Map<string, DestinationConfig> = new Map();

    constructor(
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXPORT_DESTINATION);
    }

    async onModuleInit() {
        this.logger.info('ExportDestinationService initialized');
    }

    onModuleDestroy() {
        this.destinations.clear();
    }

    registerDestination(config: DestinationConfig): void {
        if (this.destinations.size >= MAX_EXPORT_DESTINATIONS && !this.destinations.has(config.id)) {
            const oldest = this.destinations.keys().next().value;
            if (oldest !== undefined) {
                this.destinations.delete(oldest);
                this.logger.warn('Evicted oldest export destination due to limit', { evictedId: oldest, limit: MAX_EXPORT_DESTINATIONS });
            }
        }

        this.destinations.set(config.id, {
            ...config,
            enabled: config.enabled !== false,
        });
        this.logger.info(`Registered export destination: ${config.id} (${config.type})`);
    }

    getDestinations(): DestinationConfig[] {
        return Array.from(this.destinations.values());
    }

    getDestination(id: string): DestinationConfig | undefined {
        return this.destinations.get(id);
    }

    async deliver(
        destinationId: string,
        content: Buffer | string,
        filename: string,
        options?: DeliveryOptions,
    ): Promise<DeliveryResult> {
        const destination = this.destinations.get(destinationId);
        if (!destination) {
            return {
                success: false,
                destinationId,
                destinationType: DESTINATION_TYPE.LOCAL,
                filename,
                size: 0,
                error: `Destination not found: ${destinationId}`,
            };
        }

        if (!destination.enabled) {
            return {
                success: false,
                destinationId,
                destinationType: destination.type,
                filename,
                size: 0,
                error: `Destination is disabled: ${destinationId}`,
            };
        }

        const buffer = typeof content === 'string' ? Buffer.from(content) : content;

        this.logger.info(`Delivering ${filename} (${buffer.length} bytes) to ${destination.type}:${destinationId}`);

        try {
            const handler = DESTINATION_DELIVERY_REGISTRY.get(destination.type);
            if (handler) {
                return await handler(destination, buffer, filename, options);
            }

            const unknownDest = destination as { type?: string };
            const destType = unknownDest.type ?? 'unknown';
            return {
                success: false,
                destinationId,
                destinationType: destination.type,
                filename,
                size: buffer.length,
                error: `Unsupported destination type: ${destType}`,
            };
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            this.logger.error(`Delivery failed to ${destinationId}: ${errorMessage}`);
            return {
                success: false,
                destinationId,
                destinationType: destination.type,
                filename,
                size: buffer.length,
                error: errorMessage,
            };
        }
    }

    async testDestination(destinationId: string): Promise<ConnectionTestResult> {
        const destination = this.destinations.get(destinationId);
        if (!destination) {
            return { success: false, message: `Destination not found: ${destinationId}` };
        }

        const start = Date.now();

        try {
            const handler = DESTINATION_TEST_REGISTRY.get(destination.type);
            if (handler) {
                return await handler(destination, start);
            }

            // Default: report as configured for types without specific test logic
            return { success: true, message: `${destination.type} configured`, latencyMs: Date.now() - start };
        } catch (error) {
            return {
                success: false,
                message: getErrorMessage(error),
                latencyMs: Date.now() - start,
            };
        }
    }
}
