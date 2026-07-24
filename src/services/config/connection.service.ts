import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, ID } from '@vendure/core';
import { DataHubConnection } from '../../entities/config';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { ConfigurationSource, ConnectionType } from '../../constants/enums';
import type { JsonObject, JsonValue } from '../../types/index';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import { CODE_PATTERN, ENV_VARIABLE_NAME_PATTERN } from '../../../shared';
import { assertConnectionConfig, parseConnectionType } from './connection-config.validation';
import { ResourceReferenceService } from './resource-reference.service';
import { assertDatabaseConfiguration } from './configuration-ownership';
import { ManagedResourceChannelService } from './managed-resource-channel.service';

export interface RuntimeDataHubConnection {
    readonly code: string;
    readonly type: ConnectionType;
    readonly config: JsonObject;
}

interface ConnectionWriteOptions {
    readonly configurationSource?: ConfigurationSource;
    readonly allowCodeFirstManaged?: boolean;
}

const DANGEROUS_CONFIG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function resolveRuntimeEnvironmentValue(value: JsonValue, connectionCode: string): JsonValue {
    if (typeof value === 'string') {
        const textWithoutReferences = value.replace(/\$\{[^}]*\}/g, '');
        if (textWithoutReferences.includes('${')) {
            throw new Error(`Malformed environment variable reference in connection "${connectionCode}"`);
        }
        return value.replace(/\$\{([^}]*)\}/g, (_match, name: string) => {
            if (!ENV_VARIABLE_NAME_PATTERN.test(name)) {
                throw new Error(`Invalid environment variable reference "${name}" in connection "${connectionCode}"`);
            }
            const resolved = process.env[name];
            if (resolved === undefined) {
                throw new Error(`Missing environment variable "${name}" required by connection "${connectionCode}"`);
            }
            return resolved;
        });
    }
    if (Array.isArray(value)) {
        return value.map(item => resolveRuntimeEnvironmentValue(item, connectionCode));
    }
    if (value !== null && typeof value === 'object') {
        const resolved: JsonObject = {};
        for (const [key, item] of Object.entries(value)) {
            if (DANGEROUS_CONFIG_KEYS.has(key)) {
                throw new Error(`Unsafe configuration key "${key}" in connection "${connectionCode}"`);
            }
            resolved[key] = resolveRuntimeEnvironmentValue(item, connectionCode);
        }
        return resolved;
    }
    return value;
}

export function assertConnectionCode(code: string): void {
    if (code.trim() !== code || !CODE_PATTERN.test(code)) {
        throw new Error(
            'Connection codes must start with a letter and contain only letters, numbers, hyphens, and underscores',
        );
    }
}

@Injectable()
export class ConnectionService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private resourceReferences: ResourceReferenceService,
        private managedResourceChannels: ManagedResourceChannelService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CONNECTION_SERVICE);
    }

    async getByCode(ctx: RequestContext, code: string): Promise<DataHubConnection | null> {
        this.logger.debug('Looking up connection by code', { adapterCode: code });
        const result = await this.connection.getRepository(ctx, DataHubConnection).findOne({
            where: { code, channels: { id: ctx.channelId } },
        });
        if (!result) {
            this.logger.debug('Connection not found', { adapterCode: code });
        }
        return result;
    }

    async getRuntimeByCode(ctx: RequestContext, code: string): Promise<RuntimeDataHubConnection | null> {
        const entity = await this.getByCode(ctx, code);
        if (!entity) return null;
        const type = parseConnectionType(entity.type);
        assertConnectionConfig(type, entity.config);
        return {
            code: entity.code,
            type,
            config: resolveRuntimeEnvironmentValue(entity.config, entity.code) as JsonObject,
        };
    }

    async getById(ctx: RequestContext, id: ID): Promise<DataHubConnection | null> {
        return this.connection.findOneInChannel(
            ctx,
            DataHubConnection,
            id,
            ctx.channelId,
            { relations: ['channels'] },
        ).then(entity => entity ?? null);
    }

    async findAll(ctx: RequestContext): Promise<DataHubConnection[]> {
        const connections = await this.connection.getRepository(ctx, DataHubConnection).find({
            where: { channels: { id: ctx.channelId } },
            relations: ['channels'],
        });
        this.logger.debug(`Retrieved all connections`, { recordCount: connections.length });
        return connections;
    }

    async create(ctx: RequestContext, input: {
        code: string;
        type: string;
        config: JsonObject;
    }, options: ConnectionWriteOptions = {}): Promise<DataHubConnection> {
        assertConnectionCode(input.code);
        const type = parseConnectionType(input.type);
        assertConnectionConfig(type, input.config);
        this.logger.debug(`Creating connection`, { adapterCode: input.code });
        const entity = new DataHubConnection();
        entity.code = input.code;
        entity.type = type;
        entity.config = input.config;
        entity.configurationSource = options.configurationSource
            ?? ConfigurationSource.DATABASE;
        await this.managedResourceChannels.assignToCurrentChannel(ctx, entity);
        let saved: DataHubConnection;
        try {
            saved = await this.connection.getRepository(ctx, DataHubConnection).save(entity);
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            if (isDuplicateEntryError(msg)) {
                throw new Error(`Connection code "${input.code}" already exists`);
            }
            throw error;
        }
        this.logger.info('Connection created', { adapterCode: input.code, connectionId: saved.id });
        return saved;
    }

    async update(ctx: RequestContext, id: ID, input: {
        code?: string;
        type?: string;
        config?: JsonObject;
    }, options: ConnectionWriteOptions = {}): Promise<DataHubConnection | null> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        const entity = await this.connection.findOneInChannel(
            ctx,
            DataHubConnection,
            id,
            ctx.channelId,
        );
        if (!entity) {
            this.logger.warn('Connection not found for update', { connectionId: id });
            return null;
        }
        if (!options.allowCodeFirstManaged) {
            assertDatabaseConfiguration(
                entity.configurationSource,
                'Connection',
                entity.code,
                'updated',
            );
        }
        const currentType = parseConnectionType(entity.type);
        const nextType = input.type === undefined
            ? currentType
            : parseConnectionType(input.type);
        const nextConfig = input.config ?? entity.config;
        assertConnectionConfig(nextType, nextConfig);
        const codeChanges = input.code !== undefined && input.code !== entity.code;
        if (codeChanges || nextType !== currentType) {
            await this.resourceReferences.assertConnectionMutable(ctx, entity.code);
        }
        if (input.code !== undefined) {
            assertConnectionCode(input.code);
            entity.code = input.code;
        }
        entity.type = nextType;
        entity.config = nextConfig;
        if (options.configurationSource !== undefined) {
            entity.configurationSource = options.configurationSource;
        }
        let saved: DataHubConnection;
        try {
            saved = await repo.save(entity);
        } catch (error: unknown) {
            const msg = getErrorMessage(error);
            if (isDuplicateEntryError(msg)) {
                throw new Error(`Connection code "${entity.code}" already exists`);
            }
            throw error;
        }
        this.logger.info('Connection updated', { adapterCode: entity.code, connectionId: id });
        return saved;
    }

    async delete(ctx: RequestContext, id: ID): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        const plan = await this.managedResourceChannels.prepareDelete(
            ctx,
            DataHubConnection,
            id,
        );
        if (plan.physicallyDelete) {
            assertDatabaseConfiguration(
                plan.entity.configurationSource,
                'Connection',
                plan.entity.code,
                'deleted',
            );
            await this.resourceReferences.assertConnectionMutable(ctx, plan.entity.code);
            await repo.remove(plan.entity);
        } else {
            await this.resourceReferences.assertConnectionUnassignable(
                ctx,
                plan.entity.code,
            );
            await this.managedResourceChannels.removeFromActiveChannel(
                ctx,
                DataHubConnection,
                id,
            );
        }
        this.logger.info('Connection deleted', {
            adapterCode: plan.entity.code,
            connectionId: id,
        });
        return true;
    }

    async releaseCodeFirstOwnership(
        ctx: RequestContext,
        activeCodes: ReadonlySet<string>,
    ): Promise<number> {
        const repository = this.connection.getRepository(ctx, DataHubConnection);
        const managedConnections = await repository.find({
            where: {
                configurationSource: ConfigurationSource.CODE_FIRST,
                channels: { id: ctx.channelId },
            },
        });
        const released = managedConnections.filter(
            connection => !activeCodes.has(connection.code),
        );
        if (released.length === 0) {
            return 0;
        }
        for (const connection of released) {
            await repository.update(
                { id: connection.id },
                { configurationSource: ConfigurationSource.DATABASE },
            );
        }
        return released.length;
    }
}
