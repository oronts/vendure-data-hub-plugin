import { RequestContext } from '@vendure/core';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { SecretResolver, ConnectionResolver, AdapterLogger, ConnectionConfig, ConnectionType } from '../../sdk/types';
import { DataHubLogger } from '../../services/logger';
import { JsonObject } from '../../types/index';
import { ExecutionResult } from '../executor-types';
import { toErrorOrUndefined } from '../../utils/error.utils';

export function createSecretsAdapter(secretService: SecretService, ctx: RequestContext): SecretResolver {
    return {
        get: async (code: string) => {
            const value = await secretService.resolve(ctx, code);
            return value ?? undefined;
        },
        getRequired: async (code: string) => {
            const value = await secretService.resolve(ctx, code);
            if (!value) throw new Error(`Secret not found: ${code}`);
            return value;
        },
    };
}

export function createConnectionsAdapter(connectionService: ConnectionService, ctx: RequestContext): ConnectionResolver {
    return {
        get: async (code: string) => {
            const conn = await connectionService.getByCode(ctx, code);
            if (!conn) return undefined;
            return {
                code: conn.code,
                type: conn.type as ConnectionType,
                ...conn.config,
            } as ConnectionConfig;
        },
        getRequired: async (code: string) => {
            const conn = await connectionService.getByCode(ctx, code);
            if (!conn) throw new Error(`Connection not found: ${code}`);
            return {
                code: conn.code,
                type: conn.type as ConnectionType,
                ...conn.config,
            } as ConnectionConfig;
        },
    };
}

export function createLoggerAdapter(logger: DataHubLogger): AdapterLogger {
    return {
        info: (msg: string, meta?: JsonObject) => logger.info(msg, meta),
        warn: (msg: string, meta?: JsonObject) => logger.warn(msg, meta),
        error: (msg: string, errorOrMeta?: Error | JsonObject, meta?: JsonObject) => {
            if (errorOrMeta instanceof Error) {
                logger.error(msg, errorOrMeta, meta);
            } else {
                logger.error(msg, undefined, errorOrMeta);
            }
        },
        debug: (msg: string, meta?: JsonObject) => logger.debug(msg, meta),
    };
}

/**
 * Shared error handler for custom adapter execution failures (export, feed, sink).
 * Logs the error and returns a standardized ExecutionResult with all records marked as failed.
 */
export function handleCustomAdapterError(
    error: unknown,
    logger: DataHubLogger,
    label: string,
    adapterCode: string,
    stepKey: string,
    inputLength: number,
): ExecutionResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${label} failed`, toErrorOrUndefined(error), {
        adapterCode,
        stepKey,
        errorMessage,
    });
    return { ok: 0, fail: inputLength, error: errorMessage };
}
