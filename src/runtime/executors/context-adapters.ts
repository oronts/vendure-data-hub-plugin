import { RequestContext, ID } from '@vendure/core';
import { SecretService } from '../../services/config/secret.service';
import { ConnectionService } from '../../services/config/connection.service';
import { SecretResolver, ConnectionResolver, AdapterLogger, ConnectionConfig, ConnectionType } from '../../sdk/types';
import { DataHubLogger } from '../../services/logger';
import { JsonObject, PipelineContext as PipelineCtx } from '../../types/index';
import { ExecutionResult, SANDBOX_PIPELINE_ID } from '../executor-types';
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

/**
 * Base context properties shared by all custom adapter types (load, export, feed, sink).
 * Consolidates common fields to reduce duplication across executor context builders.
 */
export interface BaseAdapterContext {
    /** Vendure request context */
    readonly ctx: RequestContext;
    /** Pipeline ID */
    readonly pipelineId: ID;
    /** Step key in the pipeline */
    readonly stepKey: string;
    /** Pipeline context with settings */
    readonly pipelineContext: PipelineCtx;
    /** Secret resolver */
    readonly secrets: SecretResolver;
    /** Connection resolver */
    readonly connections: ConnectionResolver;
    /** Logger for the adapter */
    readonly logger: AdapterLogger;
    /** Whether this is a dry run */
    readonly dryRun: boolean;
}

/**
 * Creates base adapter context with common fields shared by load, export, feed, and sink executors.
 * Consolidates the repetitive context building pattern into a single helper.
 */
export function createBaseAdapterContext(
    ctx: RequestContext,
    stepKey: string,
    secretService: SecretService,
    connectionService: ConnectionService,
    logger: DataHubLogger,
    pipelineContext?: PipelineCtx,
): BaseAdapterContext {
    return {
        ctx,
        pipelineId: SANDBOX_PIPELINE_ID,
        stepKey,
        pipelineContext: pipelineContext ?? {} as PipelineCtx,
        secrets: createSecretsAdapter(secretService, ctx),
        connections: createConnectionsAdapter(connectionService, ctx),
        logger: createLoggerAdapter(logger),
        dryRun: false,
    };
}
