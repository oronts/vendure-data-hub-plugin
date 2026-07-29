import * as crypto from 'crypto';
import type { RequestContext } from '@vendure/core';
import { SINK } from '../../constants/defaults';
import { QueueType } from '../../constants/enums';
import { queueAdapterRegistry } from '../../sdk/adapters/queue/queue-adapter.registry';
import type { QueueConnectionConfig, QueueMessage } from '../../sdk/adapters/queue/queue-adapter.interface';
import type { JsonObject } from '../../types';
import { chunk } from '../../utils/array.utils';
import { getPath } from '../path.utils';
import type { ExecutionResult, RecordObject } from '../executor-types';
import { resolveRequiredSecret } from './sink-handler-common';
import { type QueueProducerSinkCfg, type SinkHandlerContext, type SinkServices } from './sink-handler-types';

async function resolveQueueConnectionSecrets(
    services: SinkServices,
    ctx: RequestContext,
    raw: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};
    const secretReferences: Array<{ field: string; code: string; target: string }> = [];
    for (const [field, value] of Object.entries(raw)) {
        if (!field.endsWith('SecretCode')) {
            resolved[field] = value;
            continue;
        }
        if (value === undefined || value === null || value === '') continue;
        if (typeof value !== 'string') {
            throw new Error(`Queue connection field "${field}" must contain a Secret Code`);
        }
        secretReferences.push({
            field,
            code: value,
            target: field.slice(0, -'SecretCode'.length),
        });
    }
    const secretValues = await Promise.all(secretReferences.map(reference =>
        resolveRequiredSecret(services, ctx, reference.code, `connection.${reference.field}`),
    ));
    for (const [index, reference] of secretReferences.entries()) {
        resolved[reference.target] = secretValues[index];
    }
    if (raw.ssl !== undefined && resolved.useTls === undefined) {
        resolved.useTls = !!raw.ssl;
    }
    return resolved;
}


export async function handleQueueProducer(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, onRecordError } = hCtx;
    const cfg = step.config as QueueProducerSinkCfg;
    const queueType = String(cfg.queueType ?? QueueType.RABBITMQ).toLowerCase().replace(/_/g, '-');
    const connectionCode = cfg.connectionCode;
    const queueName = cfg.queueName;
    const routingKey = cfg.routingKey;
    const headers = cfg.headers;
    const idField = cfg.idField;
    const batchSize = Number(cfg.batchSize ?? SINK.QUEUE_BATCH_SIZE) || SINK.QUEUE_BATCH_SIZE;
    const persistent = cfg.persistent !== false;
    const priority = cfg.priority;
    const ttlMs = cfg.ttlMs;

    if (!connectionCode || !queueName) {
        const missingFields = [!connectionCode && 'connectionCode', !queueName && 'queueName'].filter(Boolean).join(', ');
        services.logger.error(`Queue producer missing required fields: ${missingFields}`, undefined, { stepKey: step.key });
        if (onRecordError) await onRecordError(step.key, `Queue producer missing required fields: ${missingFields}`, {});
        return { ok: 0, fail: input.length };
    }

    const adapter = queueAdapterRegistry.get(queueType);
    if (!adapter) {
        const availableAdapters = queueAdapterRegistry.getCodes().join(', ');
        services.logger.error(`Unknown queue type: ${queueType}. Available: ${availableAdapters}`, undefined, { stepKey: step.key });
        if (onRecordError) await onRecordError(step.key, `Unknown queue type: ${queueType}. Available: ${availableAdapters}`, {});
        return { ok: 0, fail: input.length };
    }

    const connection = await services.connectionService.getRuntimeByCode(ctx, connectionCode);
    if (!connection) {
        services.logger.error(`Queue connection not found`, undefined, { connectionCode, stepKey: step.key });
        if (onRecordError) await onRecordError(step.key, `Queue connection not found: ${connectionCode}`, {});
        return { ok: 0, fail: input.length };
    }

    const rawConfig = connection.config as Record<string, unknown>;
    const resolvedConfig = await resolveQueueConnectionSecrets(services, ctx, rawConfig);
    const connectionConfig = resolvedConfig as QueueConnectionConfig;

    let ok = 0;
    let fail = 0;
    const batches = chunk(input, batchSize);

    for (const batch of batches) {
        const operationHeader = hCtx.operation ?? 'UPSERT';
        const messages: QueueMessage[] = batch.map(record => ({
            id: idField ? String(getPath(record, idField) ?? crypto.randomUUID()) : crypto.randomUUID(),
            payload: record as JsonObject,
            routingKey,
            headers: { ...headers, 'x-datahub-operation': operationHeader },
            priority,
            ttlMs,
            persistent,
        }));

        const results = await adapter.publish(connectionConfig, queueName, messages);

        for (const result of results) {
            if (result.success) {
                ok++;
            } else {
                fail++;
                if (onRecordError) {
                    await onRecordError(step.key, result.error ?? 'Publish failed', {});
                }
            }
        }
    }

    return { ok, fail };
}


export async function handleQueueProducerDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const modifiedCtx: SinkHandlerContext = {
        ...hCtx,
        input: ids.map(id => ({ [hCtx.idField]: id }) as RecordObject),
        operation: 'DELETE',
    };
    return handleQueueProducer(modifiedCtx, services);
}
