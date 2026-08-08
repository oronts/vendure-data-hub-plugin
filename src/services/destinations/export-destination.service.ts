import { Injectable, OnModuleInit } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    DISTRIBUTED_LOCK,
    LOGGER_CONTEXTS,
    SortOrder,
} from '../../constants';
import { DataHubExportDestination } from '../../entities/config';
import type { JsonObject } from '../../types';
import { getErrorMessage } from '../../utils/error.utils';
import type { ConnectionTestResult } from '../../../shared/types';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { SecretService } from '../config/secret.service';
import {
    DestinationConfig,
    DestinationType,
    DeliveryOptions,
    DeliveryResult,
    DESTINATION_TYPE,
} from './destination.types';
import {
    getDestinationSecretCodes,
    parseDestinationConfig,
} from './destination-config.validation';
import {
    sanitizeDestinationConfig as cloneDestinationConfig,
} from './destination-config.sanitizer';
import {
    DESTINATION_DELIVERY_REGISTRY,
    DESTINATION_TEST_REGISTRY,
} from './destination-handler-registry';
import { resolveDestinationConfig } from './destination-config.resolver';

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
export class ExportDestinationService implements OnModuleInit {
    private readonly logger: DataHubLogger;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly secretService: SecretService,
        private readonly distributedLock: DistributedLockService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXPORT_DESTINATION);
    }

    onModuleInit(): void {
        this.logger.info('ExportDestinationService initialized');
    }

    async registerDestination(
        ctx: RequestContext,
        input: unknown,
    ): Promise<DestinationConfig> {
        return this.saveDestination(ctx, input, true);
    }

    async createDestination(
        ctx: RequestContext,
        input: unknown,
    ): Promise<DestinationConfig> {
        return this.saveDestination(ctx, input, false);
    }

    private async saveDestination(
        ctx: RequestContext,
        input: unknown,
        allowUpdate: boolean,
    ): Promise<DestinationConfig> {
        const config = parseDestinationConfig(input);
        const channelId = this.getChannelId(ctx);
        return this.distributedLock.withLock(
            this.getLifecycleLockKey(channelId),
            () => this.connection.withTransaction(
                ctx,
                transactionCtx => this.persistDestination(
                    transactionCtx,
                    channelId,
                    config,
                    allowUpdate,
                ),
            ),
            {
                ttlMs: DISTRIBUTED_LOCK.DEFAULT_TTL_MS,
                waitForLock: true,
                waitTimeoutMs: DISTRIBUTED_LOCK.DEFAULT_WAIT_TIMEOUT_MS,
            },
        );
    }

    async deleteDestination(
        ctx: RequestContext,
        destinationId: string,
    ): Promise<boolean> {
        const channelId = this.getChannelId(ctx);
        return this.distributedLock.withLock(
            this.getLifecycleLockKey(channelId),
            () => this.connection.withTransaction(ctx, async transactionCtx => {
                const repository = this.connection.getRepository(
                    transactionCtx,
                    DataHubExportDestination,
                );
                const entity = await repository.findOne({
                    where: { channelId, destinationId },
                });
                if (!entity) return false;
                await repository.remove(entity);
                this.logger.info(
                    `Deleted export destination: ${destinationId}`,
                    { channelId },
                );
                return true;
            }),
            {
                ttlMs: DISTRIBUTED_LOCK.DEFAULT_TTL_MS,
                waitForLock: true,
                waitTimeoutMs: DISTRIBUTED_LOCK.DEFAULT_WAIT_TIMEOUT_MS,
            },
        );
    }

    async getDestinations(ctx: RequestContext): Promise<DestinationConfig[]> {
        const rows = await this.connection.getRepository(ctx, DataHubExportDestination).find({
            where: { channelId: this.getChannelId(ctx) },
            order: { createdAt: SortOrder.ASC },
        });
        return rows.map(row => this.toDestinationConfig(row));
    }

    async getDestination(
        ctx: RequestContext,
        id: string,
    ): Promise<DestinationConfig | undefined> {
        const row = await this.connection.getRepository(ctx, DataHubExportDestination).findOne({
            where: {
                channelId: this.getChannelId(ctx),
                destinationId: id,
            },
        });
        return row ? this.toDestinationConfig(row) : undefined;
    }

    async deliver(
        ctx: RequestContext,
        destinationId: string,
        content: Buffer | string,
        filename: string,
        options?: DeliveryOptions,
    ): Promise<DeliveryResult> {
        const destination = await this.getDestination(ctx, destinationId);
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
        this.logger.info(
            `Delivering ${filename} (${buffer.length} bytes) to ${destination.type}:${destinationId}`,
        );

        try {
            const handler = DESTINATION_DELIVERY_REGISTRY.get(destination.type);
            if (!handler) {
                return {
                    success: false,
                    destinationId,
                    destinationType: destination.type,
                    filename,
                    size: buffer.length,
                    error: `Unsupported destination type: ${destination.type}`,
                };
            }
            const resolved = await resolveDestinationConfig(
                this.secretService,
                ctx,
                destination,
            );
            return await handler(resolved, buffer, filename, options);
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            this.logger.error(
                `Delivery failed to ${destinationId}: ${errorMessage}`,
            );
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

    async deliverConfigured(
        ctx: RequestContext,
        input: unknown,
        content: Buffer | string,
        filename: string,
        options?: DeliveryOptions,
    ): Promise<DeliveryResult> {
        const destination = parseDestinationConfig(input);
        if (destination.enabled === false) {
            return {
                success: false,
                destinationId: destination.id,
                destinationType: destination.type,
                filename,
                size: 0,
                error: `Destination is disabled: ${destination.id}`,
            };
        }
        const secretCodes = getDestinationSecretCodes(destination);
        const validation = await this.secretService.validateSecrets(ctx, secretCodes);
        if (!validation.valid) {
            throw new Error(
                `Destination references unavailable Secret Codes: ${validation.missing.join(', ')}`,
            );
        }

        const buffer = typeof content === 'string' ? Buffer.from(content) : content;
        const handler = DESTINATION_DELIVERY_REGISTRY.get(destination.type);
        if (!handler) {
            throw new Error(`Unsupported destination type: ${destination.type}`);
        }
        const resolved = await resolveDestinationConfig(
            this.secretService,
            ctx,
            destination,
        );
        return handler(resolved, buffer, filename, options);
    }

    async testDestination(
        ctx: RequestContext,
        destinationId: string,
    ): Promise<ConnectionTestResult> {
        const destination = await this.getDestination(ctx, destinationId);
        if (!destination) {
            return {
                success: false,
                message: `Destination not found: ${destinationId}`,
            };
        }

        const start = Date.now();
        try {
            const resolved = await resolveDestinationConfig(
                this.secretService,
                ctx,
                destination,
            );
            const handler = DESTINATION_TEST_REGISTRY.get(destination.type);
            if (handler) {
                return await handler(resolved, start);
            }
            return {
                success: false,
                message: `No connectivity test is implemented for destination type ${destination.type}`,
                latencyMs: Date.now() - start,
            };
        } catch (error) {
            return {
                success: false,
                message: getErrorMessage(error),
                latencyMs: Date.now() - start,
            };
        }
    }

    private getChannelId(ctx: RequestContext): string {
        const channelId = ctx.channelId;
        if (
            (typeof channelId !== 'string' && typeof channelId !== 'number')
            || String(channelId).trim().length === 0
        ) {
            throw new Error('Export destination operations require an active channel');
        }
        return String(channelId);
    }

    private getLifecycleLockKey(channelId: string): string {
        return `export-destination-lifecycle:${channelId}`;
    }

    private async persistDestination(
        ctx: RequestContext,
        channelId: string,
        config: DestinationConfig,
        allowUpdate: boolean,
    ): Promise<DestinationConfig> {
        const requiredSecretCodes = getDestinationSecretCodes(config);
        const secretValidation = await this.secretService.validateSecrets(
            ctx,
            requiredSecretCodes,
        );
        if (!secretValidation.valid) {
            throw new Error(
                `Destination references unavailable Secret Codes: ${secretValidation.missing.join(', ')}`,
            );
        }

        const repository = this.connection.getRepository(ctx, DataHubExportDestination);
        const existing = await repository.findOne({
            where: { channelId, destinationId: config.id },
        });
        if (existing && !allowUpdate) {
            throw new Error(
                `Export destination "${config.id}" already exists in the active channel`,
            );
        }
        if (!existing && await repository.count({ where: { channelId } }) >= MAX_EXPORT_DESTINATIONS) {
            throw new Error(
                `Export destination limit reached (${MAX_EXPORT_DESTINATIONS}); update or remove an existing destination`,
            );
        }

        const stored = cloneDestinationConfig({
            ...config,
            enabled: config.enabled !== false,
        });
        const entity = existing ?? new DataHubExportDestination();
        entity.channelId = channelId;
        entity.destinationId = stored.id;
        entity.type = stored.type;
        entity.enabled = stored.enabled !== false;
        entity.config = cloneDestinationConfig(stored) as unknown as JsonObject;
        await repository.save(entity);
        this.logger.info(
            `Registered export destination: ${stored.id} (${stored.type})`,
            { channelId },
        );
        return cloneDestinationConfig(stored);
    }

    private toDestinationConfig(entity: DataHubExportDestination): DestinationConfig {
        const config = parseDestinationConfig(entity.config);
        if (config.id !== entity.destinationId || config.type !== entity.type) {
            throw new Error(`Stored export destination "${entity.destinationId}" is inconsistent`);
        }
        return cloneDestinationConfig({
            ...config,
            enabled: entity.enabled,
        } as DestinationConfig);
    }

}
