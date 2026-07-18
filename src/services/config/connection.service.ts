import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, ID } from '@vendure/core';
import { DataHubConnection } from '../../entities/config';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { ConnectionType } from '../../constants/enums';
import type { JsonObject, JsonValue } from '../../types/index';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import { CODE_PATTERN, ENV_VARIABLE_NAME_PATTERN } from '../../../shared';
import { assertConnectionConfig, parseConnectionType } from './connection-config.validation';
import { ResourceReferenceService } from './resource-reference.service';

export interface RuntimeDataHubConnection {
    readonly code: string;
    readonly type: ConnectionType;
    readonly config: JsonObject;
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
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.CONNECTION_SERVICE);
    }

    async getByCode(ctx: RequestContext, code: string): Promise<DataHubConnection | null> {
        this.logger.debug('Looking up connection by code', { adapterCode: code });
        const result = await this.connection.getRepository(ctx, DataHubConnection).findOne({ where: { code } });
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
        return this.connection.getRepository(ctx, DataHubConnection).findOne({ where: { id } });
    }

    async findAll(ctx: RequestContext): Promise<DataHubConnection[]> {
        const connections = await this.connection.getRepository(ctx, DataHubConnection).find();
        this.logger.debug(`Retrieved all connections`, { recordCount: connections.length });
        return connections;
    }

    async create(ctx: RequestContext, input: {
        code: string;
        type: string;
        config: JsonObject;
    }): Promise<DataHubConnection> {
        assertConnectionCode(input.code);
        const type = parseConnectionType(input.type);
        assertConnectionConfig(type, input.config);
        this.logger.debug(`Creating connection`, { adapterCode: input.code });
        const entity = new DataHubConnection();
        entity.code = input.code;
        entity.type = type;
        entity.config = input.config;
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
    }): Promise<DataHubConnection | null> {
        const repo = this.connection.getRepository(ctx, DataHubConnection);
        const entity = await repo.findOne({ where: { id } });
        if (!entity) {
            this.logger.warn('Connection not found for update', { connectionId: id });
            return null;
        }
        const nextType = input.type === undefined
            ? parseConnectionType(entity.type)
            : parseConnectionType(input.type);
        const nextConfig = input.config ?? entity.config;
        assertConnectionConfig(nextType, nextConfig);
        if (input.code !== undefined) {
            assertConnectionCode(input.code);
            if (input.code !== entity.code) {
                await this.resourceReferences.assertConnectionMutable(ctx, entity.code);
            }
            entity.code = input.code;
        }
        entity.type = nextType;
        entity.config = nextConfig;
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
        const entity = await repo.findOne({ where: { id } });
        if (!entity) {
            this.logger.warn('Connection not found for deletion', { connectionId: id });
            return false;
        }
        await this.resourceReferences.assertConnectionMutable(ctx, entity.code);
        await repo.remove(entity);
        this.logger.info('Connection deleted', { adapterCode: entity.code, connectionId: id });
        return true;
    }
}
