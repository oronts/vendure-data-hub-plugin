/**
 * GraphQL Extract Handler
 *
 * Extracts records from GraphQL APIs with support for:
 * - Cursor-based pagination
 * - Relay-style connections (edges/node pattern)
 * - Bearer and Basic authentication
 *
 * @module runtime/executors/extractors
 */

import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { RecordObject } from '../../executor-types';
import { JsonObject, JsonValue } from '../../../types/index';
import { SecretService } from '../../../services/config/secret.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { getPath } from '../../utils';
import { PAGINATION, LOGGER_CONTEXTS, HttpMethod, HTTP_HEADERS, CONTENT_TYPES, AUTH_SCHEMES } from '../../../constants/index';
import { ConnectionAuthType } from '../../../sdk/types/connection-types';
import {
    ExtractHandler,
    ExtractHandlerContext,
    getExtractConfig,
    updateCheckpoint,
    getCheckpointValue,
} from './extract-handler.interface';
import { assertUrlSafe } from '../../../utils/url-security.utils';

interface GraphqlExtractConfig {
    endpoint?: string;
    query?: string;
    variables?: Record<string, unknown>;
    headers?: Record<string, string>;
    auth?: ConnectionAuthType;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
    itemsField?: string;
    edgesField?: string;
    nodeField?: string;
    cursorVar?: string;
    nextCursorField?: string;
    pageInfoField?: string;
    hasNextPageField?: string;
    endCursorField?: string;
}

interface GraphqlError {
    message?: string;
}

@Injectable()
export class GraphqlExtractHandler implements ExtractHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);
    }

    async extract(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { ctx, step, executorCtx, onRecordError } = context;
        const cfg = getExtractConfig<GraphqlExtractConfig>(step);

        const fetchImpl = globalThis.fetch;
        if (!fetchImpl) return [];

        const endpoint = String(cfg.endpoint ?? '');
        const headers = await this.buildHeaders(ctx, cfg);
        const results: RecordObject[] = [];

        let cursor: unknown = getCheckpointValue(executorCtx, step.key, 'cursor', null);

        for (let i = 0; i < PAGINATION.MAX_GRAPHQL_PAGES; i++) {
            const fetchResult = await this.executeGraphqlQuery({
                fetchImpl,
                endpoint,
                headers,
                query: String(cfg.query ?? ''),
                variables: { ...(cfg.variables ?? {}), ...(cursor ? { [cfg.cursorVar ?? 'cursor']: cursor } : {}) },
            });

            if (!fetchResult.success) {
                if (onRecordError) {
                    await onRecordError(step.key, `GraphQL query failed: ${fetchResult.error}`, { endpoint });
                }
                break;
            }

            const gqlErrors = this.extractGraphqlErrors(fetchResult.data);
            if (gqlErrors.length) {
                const msg = gqlErrors.join('; ');
                if (onRecordError) {
                    await onRecordError(step.key, msg, { endpoint, variables: (cfg.variables ?? null) as JsonObject | null });
                }
                break;
            }

            const items = this.extractItems(fetchResult.data, cfg);
            results.push(...items);

            const nextCursor = this.determineNextCursor(fetchResult.data as RecordObject, cfg, cursor as JsonValue);
            if (!nextCursor || nextCursor === cursor) break;

            cursor = nextCursor;
            updateCheckpoint(executorCtx, step.key, { cursor: cursor as import('../../../types/index').JsonValue });
        }

        return results;
    }

    private async buildHeaders(ctx: RequestContext, cfg: GraphqlExtractConfig): Promise<Record<string, string>> {
        let headers: Record<string, string> = { ...(cfg.headers ?? {}) };

        try {
            const auth = cfg.auth ?? ConnectionAuthType.NONE;

            if (auth === ConnectionAuthType.BEARER && cfg.bearerTokenSecretCode) {
                const token = await this.resolveSecret(ctx, cfg.bearerTokenSecretCode);
                if (token) {
                    headers = { ...headers, [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BEARER} ${token}` };
                }
            } else if (auth === ConnectionAuthType.BASIC && cfg.basicSecretCode) {
                const secret = await this.resolveSecret(ctx, cfg.basicSecretCode);
                if (secret && secret.includes(':')) {
                    const token = Buffer.from(secret).toString('base64');
                    headers = { ...headers, [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BASIC} ${token}` };
                }
            }
        } catch (error) {
            this.logger.warn('Failed to resolve authentication secrets for GraphQL extractor', {
                error: (error as Error)?.message,
            });
        }

        return headers;
    }

    private async executeGraphqlQuery(params: {
        fetchImpl: typeof fetch;
        endpoint: string;
        headers: Record<string, string>;
        query: string;
        variables: Record<string, unknown>;
    }): Promise<{ success: boolean; data?: unknown; error?: string }> {
        const { fetchImpl, endpoint, headers, query, variables } = params;

        try {
            await assertUrlSafe(endpoint);
            const res = await fetchImpl(endpoint, {
                method: HttpMethod.POST,
                headers: { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers },
                body: JSON.stringify({ query, variables }),
            });

            if (!res.ok) {
                return { success: false, error: String(res.status) };
            }

            const data = await res.json();
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    private extractGraphqlErrors(data: unknown): string[] {
        const dataObj = data as { errors?: GraphqlError[] } | null | undefined;
        const errors: GraphqlError[] = Array.isArray(dataObj?.errors) ? dataObj.errors : [];
        return errors.map(e => e?.message ?? 'GraphQL error');
    }

    private extractItems(data: unknown, cfg: GraphqlExtractConfig): RecordObject[] {
        if (Array.isArray(data)) return data as RecordObject[];

        const dataObj = data as RecordObject | null | undefined;
        if (cfg.edgesField && dataObj) {
            return this.extractFromEdges(dataObj, cfg);
        }

        if (cfg.itemsField && dataObj) {
            const items = getPath(dataObj, cfg.itemsField) ?? [];
            return Array.isArray(items) ? items as RecordObject[] : [];
        }

        return [];
    }

    private extractFromEdges(data: RecordObject, cfg: GraphqlExtractConfig): RecordObject[] {
        const edgesField = cfg.edgesField ?? 'edges';
        const edges = getPath(data, edgesField) ?? [];
        if (!Array.isArray(edges)) return [];

        const nodeField = cfg.nodeField ?? 'node';
        const items: RecordObject[] = [];

        for (const edge of edges) {
            if (edge && typeof edge === 'object' && !Array.isArray(edge)) {
                const edgeObj = edge as RecordObject;
                if (edgeObj[nodeField] != null) {
                    items.push(edgeObj[nodeField] as RecordObject);
                }
            }
        }

        return items;
    }

    private determineNextCursor(data: RecordObject, cfg: GraphqlExtractConfig, _currentCursor: JsonValue): JsonValue | undefined {
        if (cfg.nextCursorField) {
            return getPath(data, cfg.nextCursorField);
        }

        if (cfg.endCursorField) {
            const endCursor = getPath(data, cfg.endCursorField);
            const hasNextPage = this.checkHasNextPage(data, cfg);
            return hasNextPage ? endCursor : undefined;
        }

        return undefined;
    }

    private checkHasNextPage(data: RecordObject, cfg: GraphqlExtractConfig): boolean {
        if (cfg.hasNextPageField) {
            return Boolean(getPath(data, cfg.hasNextPageField));
        }

        if (cfg.pageInfoField) {
            const pageInfo = getPath(data, cfg.pageInfoField);
            if (pageInfo && typeof pageInfo === 'object' && !Array.isArray(pageInfo)) {
                return (pageInfo as { hasNextPage?: boolean }).hasNextPage !== false;
            }
        }

        return true;
    }

    private async resolveSecret(ctx: RequestContext, code?: string | null): Promise<string | null> {
        if (!code) return null;
        try {
            return await this.secretService.resolve(ctx, code);
        } catch (err) {
            this.logger.debug('Failed to resolve secret for GraphQL extraction', {
                secretCode: code,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }
}
