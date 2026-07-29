import { HTTP } from '../../constants/defaults';
import { AUTH_SCHEMES, CONTENT_TYPES, HTTP_HEADERS, SERVICE_URL_TEMPLATES } from '../../constants/services';
import { HttpMethod } from '../../constants/enums';
import { getAdapterCode } from '../../types/step-configs';
import { getErrorMessage } from '../../utils/error.utils';
import { assertUrlSafe } from '../../utils/url-security.utils';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { getPath } from '../path.utils';
import { resolveIndexName } from '../executor-helpers';
import { parseElasticBulkResult, parseTypesenseImportResult, readNumericTaskId } from './search-sink-results';
import { pollSearchTask, validateSearchIdentities } from './search-sink-execution';
import { executeBatchedSearchSink, getCircuitKey, resolveElasticsearchCredentials, resolveRequiredConfiguredSecret, resolveTypesenseHost } from './sink-handler-common';
import { SINK_ADAPTER_CODES, type SinkHandlerContext, type SinkServices } from './sink-handler-types';
import type { ExecutionResult } from '../executor-types';

export async function handleMeiliSearch(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError } = hCtx;
    const host = cfg.host;
    if (!host) throw new Error('MeiliSearch sink requires a host URL');
    const apiKey = await resolveRequiredConfiguredSecret(
        services, ctx, cfg.apiKeySecretCode, 'apiKeySecretCode',
    );
    const primaryKey = cfg.primaryKey ?? idField;
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.MEILISEARCH, host);

    await assertUrlSafe(host);

    // Configure index settings if provided
    // Fields can be JSON arrays or comma-separated strings
    const parseFieldList = (val: unknown): string[] | undefined => {
        if (Array.isArray(val)) return val.map(String);
        if (typeof val === 'string' && val.trim()) return val.split(',').map(s => s.trim()).filter(Boolean);
        return undefined;
    };
    const searchableFields = parseFieldList((hCtx.cfg as Record<string, unknown>).searchableFields);
    const filterableFields = parseFieldList((hCtx.cfg as Record<string, unknown>).filterableFields);
    const sortableFields = parseFieldList((hCtx.cfg as Record<string, unknown>).sortableFields);

    if (searchableFields || filterableFields || sortableFields) {
        const settingsHeaders: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON };
        settingsHeaders[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${apiKey}`;
        try {
            const settingsResponse = await secureFetch(`${host}/indexes/${encodeURIComponent(indexName)}/settings`, {
                method: HttpMethod.PATCH,
                headers: settingsHeaders,
                body: JSON.stringify({
                    ...(searchableFields ? { searchableAttributes: searchableFields } : {}),
                    ...(filterableFields ? { filterableAttributes: filterableFields } : {}),
                    ...(sortableFields ? { sortableAttributes: sortableFields } : {}),
                }),
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            });
            if (!settingsResponse.ok) {
                services.logger.warn(`MeiliSearch settings update failed: ${settingsResponse.status}`, { stepKey: hCtx.step.key, indexName });
            }
        } catch (e: unknown) {
            services.logger.warn(`Failed to update MeiliSearch index settings`, { error: getErrorMessage(e), stepKey: hCtx.step.key });
        }
    }

    const identities = await validateSearchIdentities(step.key, input, primaryKey, onRecordError);
    const result = await executeBatchedSearchSink(
        services, identities.valid, bulkSize, circuitKey, 'MeiliSearch', host, step.key, onRecordError,
        async (batch, signal) => {
            const docs = batch.map(prepareDoc);
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON };
            headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${apiKey}`;
            const url = `${host}/indexes/${encodeURIComponent(indexName)}/documents?primaryKey=${encodeURIComponent(primaryKey)}`;
            return secureFetch(url, {
                method: HttpMethod.POST,
                headers,
                body: JSON.stringify(docs),
                signal,
            });
        },
        async (body, batch) => {
            const taskUid = readNumericTaskId(body, 'taskUid', 'MeiliSearch');
            await pollSearchTask(
                'MeiliSearch',
                `${host}/tasks/${taskUid}`,
                {
                    [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BEARER} ${apiKey}`,
                },
                ['succeeded'],
                ['failed', 'canceled'],
            );
            return { ok: batch.length, fail: 0, errors: [] };
        },
    );
    return { ok: result.ok, fail: result.fail + identities.invalid };
}
export async function handleElasticsearch(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError } = hCtx;
    const adapterCode = getAdapterCode(step) || undefined;
    const host = cfg.node;
    if (!host) throw new Error('Elasticsearch/OpenSearch sink requires a node URL');
    const credentials = await resolveElasticsearchCredentials(services, ctx, cfg);
    const effectiveAdapterCode = adapterCode ?? SINK_ADAPTER_CODES.ELASTICSEARCH;
    const circuitKey = getCircuitKey(effectiveAdapterCode, host);

    await assertUrlSafe(host);

    const identities = await validateSearchIdentities(step.key, input, idField, onRecordError);
    const result = await executeBatchedSearchSink(
        services, identities.valid, bulkSize, circuitKey, effectiveAdapterCode, host, step.key, onRecordError,
        async (batch, signal) => {
            const bulkBody: string[] = [];
            for (const rec of batch) {
                const doc = prepareDoc(rec);
                const docId = String(getPath(rec, idField) ?? '');
                bulkBody.push(JSON.stringify({ index: { _index: indexName, _id: docId } }));
                bulkBody.push(JSON.stringify(doc));
            }
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.NDJSON };
            if (credentials.apiKey) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.API_KEY} ${credentials.apiKey}`;
            else if (credentials.basicAuth) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(credentials.basicAuth).toString('base64')}`;

            return secureFetch(`${host}/_bulk`, {
                method: HttpMethod.POST,
                headers,
                body: bulkBody.join('\n') + '\n',
                signal,
            });
        },
        (body, batch) => parseElasticBulkResult(body, batch.length),
    );
    return { ok: result.ok, fail: result.fail + identities.invalid };
}

export async function handleAlgolia(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError } = hCtx;
    const applicationId = cfg.appId;
    if (!applicationId) {
        if (onRecordError) await onRecordError(step.key, 'Algolia appId is required', {});
        return { ok: 0, fail: input.length };
    }
    const apiKey = await resolveRequiredConfiguredSecret(
        services, ctx, cfg.apiKeySecretCode, 'apiKeySecretCode',
    );

    const algoliaHost = SERVICE_URL_TEMPLATES.ALGOLIA_API(applicationId);
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.ALGOLIA, algoliaHost);

    await assertUrlSafe(algoliaHost);

    const identities = await validateSearchIdentities(step.key, input, idField, onRecordError);
    const result = await executeBatchedSearchSink(
        services, identities.valid, bulkSize, circuitKey, 'Algolia', applicationId, step.key, onRecordError,
        async (batch, signal) => {
            const docs = batch.map(rec => {
                const doc = prepareDoc(rec);
                return { ...doc, objectID: String(getPath(rec, idField) ?? '') };
            });
            const url = `${algoliaHost}/1/indexes/${encodeURIComponent(indexName)}/batch`;
            return secureFetch(url, {
                method: HttpMethod.POST,
                headers: {
                    'X-Algolia-Application-Id': applicationId,
                    'X-Algolia-API-Key': apiKey,
                    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
                },
                body: JSON.stringify({ requests: docs.map(d => ({ action: 'updateObject', body: d })) }),
                signal,
            });
        },
        async (body, batch) => {
            const taskId = readNumericTaskId(body, 'taskID', 'Algolia');
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
            return { ok: batch.length, fail: 0, errors: [] };
        },
    );
    return { ok: result.ok, fail: result.fail + identities.invalid };
}

export async function handleTypesense(hCtx: SinkHandlerContext, services: SinkServices): Promise<ExecutionResult> {
    const { ctx, step, input, cfg, indexName, idField, bulkSize, prepareDoc, onRecordError } = hCtx;
    const host = resolveTypesenseHost(cfg);
    const apiKey = await resolveRequiredConfiguredSecret(
        services, ctx, cfg.apiKeySecretCode, 'apiKeySecretCode',
    );
    const collectionName = resolveIndexName(cfg.collectionName ?? indexName, cfg.languageCode);
    const circuitKey = getCircuitKey(SINK_ADAPTER_CODES.TYPESENSE, host);

    await assertUrlSafe(host);

    const identities = await validateSearchIdentities(step.key, input, idField, onRecordError);
    const result = await executeBatchedSearchSink(
        services, identities.valid, bulkSize, circuitKey, 'Typesense', host, step.key, onRecordError,
        async (batch, signal) => {
            const docs = batch.map(rec => {
                const doc = prepareDoc(rec);
                return { ...doc, id: String(getPath(rec, idField) ?? '') };
            });
            const ndjson = docs.map(d => JSON.stringify(d)).join('\n');
            const headers: Record<string, string> = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.PLAIN };
            headers[HTTP_HEADERS.X_TYPESENSE_API_KEY] = apiKey;

            const url = `${host}/collections/${encodeURIComponent(collectionName)}/documents/import?action=upsert`;
            return secureFetch(url, {
                method: HttpMethod.POST,
                headers,
                body: ndjson,
                signal,
            });
        },
        (body, batch) => parseTypesenseImportResult(body, batch.length),
    );
    return { ok: result.ok, fail: result.fail + identities.invalid };
}
