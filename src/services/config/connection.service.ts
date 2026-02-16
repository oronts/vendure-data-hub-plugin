import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, ID } from '@vendure/core';
import { DataHubConnection } from '../../entities/config';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { ConnectionType } from '../../constants/enums';
import type { JsonObject } from '../../types/index';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';

@Injectable()
export class ConnectionService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
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
        this.logger.debug(`Creating connection`, { adapterCode: input.code });
        const entity = new DataHubConnection();
        entity.code = input.code;
        entity.type = input.type as ConnectionType;
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
        if (input.code !== undefined) entity.code = input.code;
        if (input.type !== undefined) entity.type = input.type as ConnectionType;
        if (input.config !== undefined) entity.config = input.config;
        const saved = await repo.save(entity);
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
        await repo.remove(entity);
        this.logger.info('Connection deleted', { adapterCode: entity.code, connectionId: id });
        return true;
    }
}

