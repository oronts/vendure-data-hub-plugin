import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

import {
    DestinationType,
    DestinationConfig,
    DeliveryResult,
    DeliveryOptions,
    ConnectionTestResult,
    S3DestinationConfig,
    SFTPDestinationConfig,
    FTPDestinationConfig,
    HTTPDestinationConfig,
    LocalDestinationConfig,
    EmailDestinationConfig,
    DESTINATION_TYPE,
} from './destination.types';
import { deliverToS3 } from './s3.handler';
import { deliverToHTTP } from './http.handler';
import { deliverToLocal, testLocalDestination } from './local.handler';
import { deliverToSFTP, deliverToFTP } from './ftp.handler';
import { deliverToEmail } from './email.handler';
import { assertUrlSafe } from '../../utils/url-security.utils';
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
            switch (destination.type) {
                case DESTINATION_TYPE.S3:
                    return deliverToS3(destination as S3DestinationConfig, buffer, filename, options);
                case DESTINATION_TYPE.SFTP:
                    return deliverToSFTP(destination as SFTPDestinationConfig, buffer, filename, options);
                case DESTINATION_TYPE.FTP:
                    return deliverToFTP(destination as FTPDestinationConfig, buffer, filename, options);
                case DESTINATION_TYPE.HTTP:
                    return deliverToHTTP(destination as HTTPDestinationConfig, buffer, filename, options);
                case DESTINATION_TYPE.LOCAL:
                    return deliverToLocal(destination as LocalDestinationConfig, buffer, filename, options);
                case DESTINATION_TYPE.EMAIL:
                    return deliverToEmail(destination as EmailDestinationConfig, buffer, filename, options);
                default: {
                    const unknownDest = destination as { type?: string };
                    const destType = unknownDest.type ?? 'unknown';
                    return {
                        success: false,
                        destinationId,
                        destinationType: DESTINATION_TYPE.LOCAL,
                        filename,
                        size: buffer.length,
                        error: `Unsupported destination type: ${destType}`,
                    };
                }
            }
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
            switch (destination.type) {
                case DESTINATION_TYPE.S3:
                    return { success: true, message: 'S3 connection configured', latencyMs: Date.now() - start };

                case DESTINATION_TYPE.HTTP: {
                    const httpConfig = destination as HTTPDestinationConfig;
                    await assertUrlSafe(httpConfig.url);
                    const response = await fetch(httpConfig.url, { method: 'HEAD' }).catch(() => null);
                    if (response) {
                        return { success: true, message: `HTTP endpoint reachable (${response.status})`, latencyMs: Date.now() - start };
                    }
                    return { success: false, message: 'HTTP endpoint unreachable' };
                }

                case DESTINATION_TYPE.LOCAL: {
                    const result = testLocalDestination(destination as LocalDestinationConfig);
                    return { ...result, latencyMs: Date.now() - start };
                }

                default:
                    return { success: true, message: `${destination.type} configured`, latencyMs: Date.now() - start };
            }
        } catch (error) {
            return {
                success: false,
                message: getErrorMessage(error),
                latencyMs: Date.now() - start,
            };
        }
    }
}
