import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    TransactionalConnection,
    Logger,
} from '@vendure/core';
import { LOGGER_CTX } from '../../constants/index';

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
} from './destination.types';
import { deliverToS3 } from './s3.handler';
import { deliverToHTTP } from './http.handler';
import { deliverToLocal, testLocalDestination } from './local.handler';
import { deliverToSFTP, deliverToFTP } from './ftp.handler';
import { deliverToEmail } from './email.handler';

export type { DestinationType, DestinationConfig, DeliveryResult };
export type {
    S3DestinationConfig,
    SFTPDestinationConfig,
    FTPDestinationConfig,
    HTTPDestinationConfig,
    LocalDestinationConfig,
    EmailDestinationConfig,
} from './destination.types';

@Injectable()
export class ExportDestinationService implements OnModuleInit {
    private readonly loggerCtx = `${LOGGER_CTX}:ExportDestination`;
    private destinations: Map<string, DestinationConfig> = new Map();

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async onModuleInit() {
        Logger.info('ExportDestinationService initialized', this.loggerCtx);
    }

    registerDestination(config: DestinationConfig): void {
        this.destinations.set(config.id, {
            ...config,
            enabled: config.enabled !== false,
        });
        Logger.info(`Registered export destination: ${config.id} (${config.type})`, this.loggerCtx);
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
                destinationType: 'local',
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

        Logger.info(`Delivering ${filename} (${buffer.length} bytes) to ${destination.type}:${destinationId}`, this.loggerCtx);

        try {
            switch (destination.type) {
                case 's3':
                    return deliverToS3(destination as S3DestinationConfig, buffer, filename, options);
                case 'sftp':
                    return deliverToSFTP(destination as SFTPDestinationConfig, buffer, filename, options);
                case 'ftp':
                    return deliverToFTP(destination as FTPDestinationConfig, buffer, filename, options);
                case 'http':
                    return deliverToHTTP(destination as HTTPDestinationConfig, buffer, filename, options);
                case 'local':
                    return deliverToLocal(destination as LocalDestinationConfig, buffer, filename, options);
                case 'email':
                    return deliverToEmail(destination as EmailDestinationConfig, buffer, filename, options);
                default: {
                    // Type assertion to handle exhaustive switch
                    const unknownDest = destination as any;
                    return {
                        success: false,
                        destinationId,
                        destinationType: unknownDest.type || 'local',
                        filename,
                        size: buffer.length,
                        error: `Unsupported destination type: ${unknownDest.type}`,
                    };
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Logger.error(`Delivery failed to ${destinationId}: ${errorMessage}`, this.loggerCtx);
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
                case 's3':
                    return { success: true, message: 'S3 connection configured', latencyMs: Date.now() - start };

                case 'http': {
                    const httpConfig = destination as HTTPDestinationConfig;
                    const response = await fetch(httpConfig.url, { method: 'HEAD' }).catch(() => null);
                    if (response) {
                        return { success: true, message: `HTTP endpoint reachable (${response.status})`, latencyMs: Date.now() - start };
                    }
                    return { success: false, message: 'HTTP endpoint unreachable' };
                }

                case 'local': {
                    const result = testLocalDestination(destination as LocalDestinationConfig);
                    return { ...result, latencyMs: Date.now() - start };
                }

                default:
                    return { success: true, message: `${destination.type} configured`, latencyMs: Date.now() - start };
            }
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Connection test failed',
                latencyMs: Date.now() - start,
            };
        }
    }
}
