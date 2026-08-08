import { AUTH_SCHEMES, CONTENT_TYPES, HTTP_HEADERS, SERVICE_URL_TEMPLATES } from '../../constants/services';
import { TIME } from '../../constants/time';
import { HTTP, TRUNCATION } from '../../constants/defaults';
import { HttpMethod } from '../../constants/enums';
import { getAdapterCode } from '../../types/step-configs';
import { assertUrlSafe } from '../../utils/url-security.utils';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { getErrorMessage, getErrorStack } from '../../utils/error.utils';
import { chunk } from '../../utils/array.utils';
import { resolveIndexName } from '../executor-helpers';
import { parseElasticBulkResult, readNumericTaskId } from './search-sink-results';
import { pollSearchTask, readSearchResponseText, reportSearchBatchErrors } from './search-sink-execution';
import { checkCircuit, getCircuitKey, readSinkResponseText, resolveElasticsearchCredentials, resolveRequiredConfiguredSecret, resolveTypesenseHost } from './sink-handler-common';
import { SINK_ADAPTER_CODES, type SinkHandlerContext, type SinkServices } from './sink-handler-types';
import type { ExecutionResult } from '../executor-types';

export async function handleMeiliSearchDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const { ctx, step, cfg, indexName, bulkSize, onRecordError } = hCtx;
    const host = cfg.host;
    if (!host) throw new Error('MeiliSearch sink requires a host URL');
    const apiKey = await resolveRequiredConfiguredSecret(
        services, ctx, cfg.apiKeySecretCode, 'apiKeySecretCode',
    );
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.MEILISEARCH, host);

    await assertUrlSafe(host);

    const batches = chunk(ids, bulkSize);
    let ok = 0;
    let fail = 0;

    for (const batch of batches) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail += batch.length;
            const errorMsg = `Circuit breaker open for MeiliSearch (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        try {
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON };
            headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${apiKey}`;
            const response = await secureFetch(`${host}/indexes/${encodeURIComponent(indexName)}/documents/delete-batch`, {
                method: HttpMethod.POST,
                headers,
                body: JSON.stringify(batch),
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            const bodyText = await readSearchResponseText(response, 'MeiliSearch delete');
            if (response.ok) {
                const taskUid = readNumericTaskId(bodyText, 'taskUid', 'MeiliSearch');
                await pollSearchTask(
                    'MeiliSearch',
                    `${host}/tasks/${taskUid}`,
                    {
                        [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BEARER} ${apiKey}`,
                    },
                    ['succeeded'],
                    ['failed', 'canceled'],
                );
                ok += batch.length;
                services.circuitBreaker.recordSuccess(circuitKey);
            } else {
                fail += batch.length;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(step.key, `MeiliSearch delete error: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`, {});
            }
        } catch (e: unknown) {
            fail += batch.length;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(step.key, getErrorMessage(e), {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}
export async function handleElasticsearchDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const { ctx, step, cfg, indexName, bulkSize, onRecordError } = hCtx;
    const adapterCode = getAdapterCode(step) || undefined;
    const host = cfg.node;
    if (!host) throw new Error('Elasticsearch/OpenSearch sink requires a node URL');
    const credentials = await resolveElasticsearchCredentials(services, ctx, cfg);
    const effectiveAdapterCode = adapterCode ?? SINK_ADAPTER_CODES.ELASTICSEARCH;
    const circuitKey = getCircuitKey(effectiveAdapterCode, host);

    await assertUrlSafe(host);

    const batches = chunk(ids, bulkSize);
    let ok = 0;
    let fail = 0;

    for (const batch of batches) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail += batch.length;
            const errorMsg = `Circuit breaker open for ${effectiveAdapterCode} (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        try {
            const ndjson = batch.map(docId =>
                JSON.stringify({ delete: { _index: indexName, _id: docId } }),
            ).join('\n') + '\n';
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.NDJSON };
            if (credentials.apiKey) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.API_KEY} ${credentials.apiKey}`;
            else if (credentials.basicAuth) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(credentials.basicAuth).toString('base64')}`;

            const response = await secureFetch(`${host}/_bulk`, {
                method: HttpMethod.POST,
                headers,
                body: ndjson,
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            const bodyText = await readSearchResponseText(response, effectiveAdapterCode);
            if (response.ok) {
                const result = parseElasticBulkResult(bodyText, batch.length);
                ok += result.ok;
                fail += result.fail;
                await reportSearchBatchErrors(
                    step.key,
                    batch.map(id => ({ [hCtx.idField]: id })),
                    result,
                    onRecordError,
                );
                if (result.fail === 0) {
                    services.circuitBreaker.recordSuccess(circuitKey);
                } else {
                    services.circuitBreaker.recordFailure(circuitKey);
                }
            } else {
                fail += batch.length;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(step.key, `${effectiveAdapterCode} delete error: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`, {});
            }
        } catch (e: unknown) {
            fail += batch.length;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(step.key, getErrorMessage(e), {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}

export async function handleAlgoliaDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const { ctx, step, cfg, indexName, bulkSize, onRecordError } = hCtx;
    const applicationId = cfg.appId;
    if (!applicationId) {
        if (onRecordError) await onRecordError(step.key, 'Algolia appId is required', {});
        return { ok: 0, fail: ids.length };
    }
    const apiKey = await resolveRequiredConfiguredSecret(
        services, ctx, cfg.apiKeySecretCode, 'apiKeySecretCode',
    );

    const algoliaHost = SERVICE_URL_TEMPLATES.ALGOLIA_API(applicationId);
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.ALGOLIA, algoliaHost);

    await assertUrlSafe(algoliaHost);

    const batches = chunk(ids, bulkSize);
    let ok = 0;
    let fail = 0;

    for (const batch of batches) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail += batch.length;
            const errorMsg = `Circuit breaker open for Algolia (${applicationId}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        try {
            const response = await secureFetch(`${algoliaHost}/1/indexes/${encodeURIComponent(indexName)}/batch`, {
                method: HttpMethod.POST,
                headers: {
                    'X-Algolia-Application-Id': applicationId,
                    'X-Algolia-API-Key': apiKey,
                    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                },
                body: JSON.stringify({
                    requests: batch.map(objectID => ({ action: 'deleteObject', body: { objectID } })),
                }),
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            const bodyText = await readSearchResponseText(response, 'Algolia delete');
            if (response.ok) {
                const taskId = readNumericTaskId(bodyText, 'taskID', 'Algolia');
                await pollSearchTask(
                    'Algolia',
                    `${algoliaHost}/1/indexes/${encodeURIComponent(indexName)}/task/${taskId}`,
                    {
                        'X-Algolia-Application-Id': applicationId,
                        'X-Algolia-API-Key': apiKey,
                    },
                    ['published'],
                    ['failed'],
                );
                ok += batch.length;
                services.circuitBreaker.recordSuccess(circuitKey);
            } else {
                fail += batch.length;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(step.key, `Algolia delete error: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`, {});
            }
        } catch (e: unknown) {
            fail += batch.length;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(step.key, getErrorMessage(e), {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}

export async function handleTypesenseDelete(hCtx: SinkHandlerContext, services: SinkServices, ids: string[]): Promise<ExecutionResult> {
    const { ctx, step, cfg, indexName, onRecordError } = hCtx;
    const host = resolveTypesenseHost(cfg);
    const apiKey = await resolveRequiredConfiguredSecret(
        services, ctx, cfg.apiKeySecretCode, 'apiKeySecretCode',
    );
    const collectionName = resolveIndexName(cfg.collectionName ?? indexName, cfg.languageCode);
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.TYPESENSE, host);

    await assertUrlSafe(host);

    let ok = 0;
    let fail = 0;

    for (const id of ids) {
        const circuitResult = checkCircuit(services, circuitKey);
        if (!circuitResult.allowed) {
            fail++;
            const errorMsg = `Circuit breaker open for Typesense (${host}), retry in ${Math.ceil(circuitResult.resetTimeoutMs / TIME.SECOND)}s`;
            services.logger.warn(errorMsg, { circuitKey, state: circuitResult.state, stepKey: step.key });
            if (onRecordError) await onRecordError(step.key, errorMsg, {});
            continue;
        }

        try {
            const headers: Record<string, string> = {};
            headers[HTTP_HEADERS.X_TYPESENSE_API_KEY] = apiKey;

            const response = await secureFetch(
                `${host}/collections/${encodeURIComponent(collectionName)}/documents/${encodeURIComponent(id)}`,
                { method: 'DELETE', headers, signal: AbortSignal.timeout(HTTP.TIMEOUT_MS) },
            );
            const bodyText = await readSinkResponseText(response);
            if (response.ok) {
                ok++;
                services.circuitBreaker.recordSuccess(circuitKey);
            } else {
                fail++;
                services.circuitBreaker.recordFailure(circuitKey);
                if (onRecordError) await onRecordError(step.key, `Typesense delete error for ${id}: ${response.status}${bodyText ? ` ${bodyText.slice(0, TRUNCATION.ERROR_MESSAGE_MAX_LENGTH)}` : ''}`, {});
            }
        } catch (e: unknown) {
            fail++;
            services.circuitBreaker.recordFailure(circuitKey);
            if (onRecordError) await onRecordError(step.key, getErrorMessage(e), {}, getErrorStack(e));
        }
    }

    return { ok, fail };
}
