/**
 * REST API Extract Handler
 *
 * Extracts records from REST APIs with support for:
 * - Pagination (page-based)
 * - Retry with exponential backoff
 * - Connection-based authentication
 * - Field mapping
 *
 * @module runtime/executors/extractors
 */

import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { JsonObject, JsonValue, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, ExecutorContext } from '../../executor-types';
import { SecretService } from '../../../services/config/secret.service';
import { ConnectionService } from '../../../services/config/connection.service';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';
import { getPath } from '../../utils';
import { getErrorMessage } from '../../../utils/error.utils';
import { sleep, calculateBackoff, ResolvedRetryConfig } from '../../../utils/retry.utils';
import { PAGINATION, RATE_LIMIT, LOGGER_CONTEXTS, HTTP, HTTP_STATUS, HttpMethod, HTTP_HEADERS, CONTENT_TYPES, AUTH_SCHEMES, ConnectionType } from '../../../constants/index';
import { ConnectionAuthType } from '../../../sdk/types/connection-types';
import {
    ExtractHandler,
    ExtractHandlerContext,
    NormalizedHttpConnectionConfig,
    StoredHttpAuthConfig,
    getExtractConfig,
    updateCheckpoint,
    getCheckpointValue,
} from './extract-handler.interface';
import { assertUrlSafe } from '../../../utils/url-security.utils';

interface RestExtractConfig {
    connectionCode?: string;
    url?: string;
    method?: string;
    headers?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
    pageParam?: string;
    itemsField?: string;
    nextPageField?: string;
    maxPages?: number;
    mapFields?: Record<string, string>;
    retries?: number;
    retryDelayMs?: number;
    maxRetryDelayMs?: number;
    backoffMultiplier?: number;
    timeoutMs?: number;
    bearerToken?: string;
    bearerTokenSecretCode?: string;
    basicUser?: string;
    basicPass?: string;
    basicSecretCode?: string;
    hmacHeader?: string;
    hmacSecret?: string;
    hmacSecretCode?: string;
    hmacPayloadTemplate?: string;
}

/**
 * Raw HTTP connection config as stored in connection entity
 */
interface RawHttpConnectionConfig {
    baseUrl?: string;
    timeout?: number;
    headers?: Record<string, unknown>;
    auth?: Record<string, unknown>;
}

/**
 * Local retry config extending shared config with timeout
 */
interface ExtractRetryConfig {
    retries: number;
    retryDelay: number;
    maxRetryDelay: number;
    backoffMultiplier: number;
    timeoutMs: number;
}

/**
 * Convert local config to shared RetryConfig format
 */
function toSharedRetryConfig(config: ExtractRetryConfig): ResolvedRetryConfig {
    return {
        maxAttempts: config.retries + 1,
        initialDelayMs: config.retryDelay,
        maxDelayMs: config.maxRetryDelay,
        backoffMultiplier: config.backoffMultiplier,
        jitterFactor: 0.1,
    };
}

@Injectable()
export class RestExtractHandler implements ExtractHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private secretService: SecretService,
        private connectionService: ConnectionService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACT_EXECUTOR);
    }

    async extract(context: ExtractHandlerContext): Promise<RecordObject[]> {
        const { ctx, step, executorCtx, onRecordError } = context;
        const cfg = getExtractConfig<RestExtractConfig>(step);

        const connectionConfig = await this.resolveConnectionConfig(ctx, cfg.connectionCode);
        const endpoint = this.buildEndpoint(connectionConfig?.baseUrl, cfg.url);
        const method = (cfg.method ?? HttpMethod.GET).toUpperCase();
        const baseHeaders = this.mergeHeaders(connectionConfig?.headers, cfg.headers);
        const retryConfig = this.buildRetryConfig(cfg, executorCtx.errorHandling);

        return this.fetchWithPagination({
            ctx,
            step,
            executorCtx,
            onRecordError,
            cfg,
            connectionConfig,
            endpoint,
            method,
            baseHeaders,
            retryConfig,
        });
    }

    private async resolveConnectionConfig(
        ctx: RequestContext,
        connectionCode?: string,
    ): Promise<NormalizedHttpConnectionConfig | null> {
        if (!connectionCode) return null;

        const connectionEntity = await this.connectionService.getByCode(ctx, connectionCode);
        if (!connectionEntity || connectionEntity.type !== ConnectionType.HTTP) return null;

        return this.normalizeHttpConnectionConfig(connectionEntity.config as JsonObject);
    }

    private normalizeHttpConnectionConfig(config?: JsonObject | null): NormalizedHttpConnectionConfig | null {
        if (!config || typeof config !== 'object') return null;

        const normalized: NormalizedHttpConnectionConfig = {};
        const rawConfig = config as RawHttpConnectionConfig;

        if (typeof rawConfig.baseUrl === 'string') normalized.baseUrl = rawConfig.baseUrl;
        if (typeof rawConfig.timeout === 'number') normalized.timeout = rawConfig.timeout;
        if (rawConfig.headers && typeof rawConfig.headers === 'object') {
            normalized.headers = this.mergeHeaders(rawConfig.headers);
        }
        if (rawConfig.auth && typeof rawConfig.auth === 'object') {
            normalized.auth = this.parseAuthConfig(rawConfig.auth);
        }

        return normalized;
    }

    private parseAuthConfig(rawAuth: Record<string, unknown>): StoredHttpAuthConfig {
        return {
            type: (rawAuth.type as string) ?? ConnectionAuthType.NONE,
            headerName: rawAuth.headerName as string | undefined,
            secretCode: rawAuth.secretCode as string | undefined,
            username: rawAuth.username as string | undefined,
            usernameSecretCode: rawAuth.usernameSecretCode as string | undefined,
        };
    }

    private buildEndpoint(baseUrl?: string, endpoint?: string): string {
        const ep = String(endpoint ?? '');
        if (!baseUrl) return ep;
        if (/^https?:\/\//i.test(ep)) return ep;

        const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const normalizedEndpoint = ep.startsWith('/') ? ep : `/${ep}`;
        return `${normalizedBase}${normalizedEndpoint}`;
    }

    private mergeHeaders(...sources: Array<Record<string, unknown> | undefined>): Record<string, string> {
        const merged: Record<string, string> = {};
        for (const source of sources) {
            if (!source || typeof source !== 'object') continue;
            for (const [key, value] of Object.entries(source)) {
                if (typeof value === 'string') merged[key] = value;
            }
        }
        return merged;
    }

    private buildRetryConfig(cfg: RestExtractConfig, errorHandling?: ErrorHandlingConfig): ExtractRetryConfig {
        return {
            retries: Math.max(0, Number(cfg.retries ?? errorHandling?.maxRetries ?? 0)),
            retryDelay: Math.max(0, Number(cfg.retryDelayMs ?? errorHandling?.retryDelayMs ?? 0)),
            maxRetryDelay: Number(cfg.maxRetryDelayMs ?? errorHandling?.maxRetryDelayMs ?? HTTP.RETRY_MAX_DELAY_MS),
            backoffMultiplier: Number(cfg.backoffMultiplier ?? errorHandling?.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER),
            timeoutMs: Number(cfg.timeoutMs ?? 0),
        };
    }

    private async fetchWithPagination(params: {
        ctx: RequestContext;
        step: { key: string; config?: unknown };
        executorCtx: ExecutorContext;
        onRecordError?: (stepKey: string, message: string, record: RecordObject) => Promise<void>;
        cfg: RestExtractConfig;
        connectionConfig: NormalizedHttpConnectionConfig | null;
        endpoint: string;
        method: string;
        baseHeaders: Record<string, string>;
        retryConfig: ExtractRetryConfig;
    }): Promise<RecordObject[]> {
        const { ctx, step, executorCtx, onRecordError, cfg, connectionConfig, endpoint, method, baseHeaders, retryConfig } = params;

        const pageParam = cfg.pageParam;
        const maxPages = Number(cfg.maxPages ?? PAGINATION.MAX_PAGES);
        const results: RecordObject[] = [];

        let page = getCheckpointValue(executorCtx, step.key, 'page', 0) + 1;
        let lastPageFetched = page - 1;
        let adaptiveDelay = 0;

        const fetchImpl = globalThis.fetch;
        if (!fetchImpl) return [];

        for (let i = 0; i < (pageParam ? maxPages : 1); i++) {
            const url = this.buildUrl(endpoint, cfg.query, pageParam, page);

            try {
                const fetchResult = await this.executeFetchWithRetry({
                    ctx,
                    cfg,
                    connectionConfig,
                    url,
                    method,
                    baseHeaders,
                    retryConfig,
                    adaptiveDelay,
                    fetchImpl,
                });

                if (!fetchResult.success) {
                    if (onRecordError) {
                        await onRecordError(step.key, `REST ${method} ${url} failed: ${fetchResult.status ?? 'ERR'}`, { url, page });
                    }
                    break;
                }

                adaptiveDelay = fetchResult.adaptiveDelay;
                const items = this.extractItems(fetchResult.data, cfg);
                results.push(...items);

                const shouldContinue = this.checkPagination(fetchResult.data, cfg, items.length, pageParam);
                if (!shouldContinue) break;

                lastPageFetched = page++;
            } catch (err) {
                this.logger.warn('REST extraction failed', {
                    stepKey: step.key,
                    url,
                    page,
                    error: getErrorMessage(err),
                });
                break;
            }
        }

        if (pageParam) {
            updateCheckpoint(executorCtx, step.key, { page: lastPageFetched });
        }

        return results;
    }

    private buildUrl(endpoint: string, query?: Record<string, unknown>, pageParam?: string, page?: number): string {
        const qp = new URLSearchParams();
        if (query) {
            for (const [k, v] of Object.entries(query)) {
                qp.set(k, String(v));
            }
        }
        if (pageParam && page) qp.set(pageParam, String(page));

        const qs = qp.toString();
        if (!qs) return endpoint;

        const sep = endpoint.includes('?') ? '&' : '?';
        return `${endpoint}${sep}${qs}`;
    }

    private async executeFetchWithRetry(params: {
        ctx: RequestContext;
        cfg: RestExtractConfig;
        connectionConfig: NormalizedHttpConnectionConfig | null;
        url: string;
        method: string;
        baseHeaders: Record<string, string>;
        retryConfig: ExtractRetryConfig;
        adaptiveDelay: number;
        fetchImpl: typeof fetch;
    }): Promise<{ success: boolean; data?: JsonValue; status?: number; adaptiveDelay: number }> {
        const { ctx, cfg, connectionConfig, url, method, baseHeaders, retryConfig, fetchImpl } = params;
        let adaptiveDelay = params.adaptiveDelay;

        await assertUrlSafe(url);

        const headers = { ...baseHeaders };
        const stepAuthApplied = await this.applyStepAuth({ ctx, cfg, headers, method, url, body: cfg.body });
        if (!stepAuthApplied && connectionConfig?.auth) {
            await this.applyConnectionAuth(ctx, connectionConfig.auth, headers);
        }

        const options: RequestInit = { method, headers };
        if (method === HttpMethod.POST && cfg.body) {
            options.body = JSON.stringify(cfg.body);
            options.headers = { [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON, ...headers };
        }

        let attempt = 0;
        let res: Response | null = null;

        while (attempt <= retryConfig.retries) {
            try {
                res = await this.fetchWithTimeout(fetchImpl, url, options, retryConfig.timeoutMs);

                if (res?.ok) {
                    adaptiveDelay = Math.max(0, Math.floor(adaptiveDelay * 0.5));
                    const data = await res.json() as JsonValue;
                    return { success: true, data, adaptiveDelay };
                }

                if (res?.status === HTTP_STATUS.TOO_MANY_REQUESTS || res?.status === HTTP_STATUS.SERVICE_UNAVAILABLE) {
                    adaptiveDelay = Math.max(RATE_LIMIT.ADAPTIVE_DELAY_MIN_MS, adaptiveDelay ? adaptiveDelay * 2 : RATE_LIMIT.ADAPTIVE_DELAY_INITIAL_MS);
                }

                if (attempt < retryConfig.retries) {
                    await this.waitBeforeRetry(attempt, retryConfig, adaptiveDelay);
                }
            } catch (error) {
                // Warn log for retry attempt failure with reason
                this.logger.warn('REST fetch attempt failed', {
                    url,
                    method,
                    attempt: attempt + 1,
                    maxRetries: retryConfig.retries,
                    willRetry: attempt < retryConfig.retries,
                    error: getErrorMessage(error),
                });
                if (attempt < retryConfig.retries) {
                    await this.waitBeforeRetry(attempt, retryConfig, adaptiveDelay || RATE_LIMIT.ADAPTIVE_DELAY_INITIAL_MS);
                } else {
                    return { success: false, status: undefined, adaptiveDelay };
                }
            }
            attempt++;
        }

        return { success: false, status: res?.status, adaptiveDelay };
    }

    private async fetchWithTimeout(fetchImpl: typeof fetch, url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
        if (timeoutMs <= 0) {
            return fetchImpl(url, options);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetchImpl(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    private async waitBeforeRetry(attempt: number, retryConfig: ExtractRetryConfig, adaptiveDelay: number): Promise<void> {
        const sharedConfig = toSharedRetryConfig(retryConfig);
        const expDelay = calculateBackoff(attempt + 1, sharedConfig);
        await sleep(Math.max(expDelay, adaptiveDelay));
    }

    private extractItems(data: JsonValue | undefined, cfg: RestExtractConfig): RecordObject[] {
        if (data === undefined) return [];
        let items: JsonValue[] = Array.isArray(data)
            ? data
            : (cfg.itemsField ? (getPath(data as RecordObject, cfg.itemsField) as JsonValue[] ?? []) : []);
        if (!Array.isArray(items)) items = [];

        if (cfg.mapFields && Object.keys(cfg.mapFields).length > 0) {
            const mapping = cfg.mapFields;
            return items.map(it => this.applyMapping(it as RecordObject, mapping));
        }

        return items as RecordObject[];
    }

    private applyMapping(record: RecordObject, mapping: Record<string, string>): RecordObject {
        const out: RecordObject = {};
        for (const [dst, srcPath] of Object.entries(mapping)) {
            out[dst] = getPath(record, srcPath);
        }
        return out;
    }

    private checkPagination(data: JsonValue | undefined, cfg: RestExtractConfig, itemCount: number, pageParam?: string): boolean {
        if (!pageParam || data === undefined) return false;

        const nextVal = cfg.nextPageField && typeof data === 'object' && data !== null && !Array.isArray(data)
            ? getPath(data as RecordObject, cfg.nextPageField)
            : undefined;
        if (cfg.nextPageField && nextVal) return true;
        if (!cfg.nextPageField && itemCount > 0) return true;

        return false;
    }

    private async applyStepAuth(params: {
        ctx: RequestContext;
        cfg: RestExtractConfig;
        headers: Record<string, string>;
        method: string;
        url: string;
        body?: unknown;
    }): Promise<boolean> {
        const { ctx, cfg, headers, method, url, body } = params;

        if (cfg.bearerToken || cfg.bearerTokenSecretCode) {
            let token: string | undefined = cfg.bearerToken;
            if (!token && cfg.bearerTokenSecretCode) {
                token = await this.resolveSecret(ctx, cfg.bearerTokenSecretCode) ?? undefined;
            }
            if (token) {
                headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
                return true;
            }
        }

        if ((cfg.basicUser && cfg.basicPass) || cfg.basicSecretCode) {
            const basicAuth = await this.resolveBasicAuth(ctx, cfg);
            if (basicAuth) {
                headers[HTTP_HEADERS.AUTHORIZATION] = basicAuth;
                return true;
            }
        }

        if (cfg.hmacHeader && (cfg.hmacSecret || cfg.hmacSecretCode)) {
            const hmacHeader = await this.generateHmacSignature(ctx, cfg, method, url, body);
            if (hmacHeader) {
                headers[cfg.hmacHeader] = hmacHeader;
                return true;
            }
        }

        return false;
    }

    private async resolveBasicAuth(ctx: RequestContext, cfg: RestExtractConfig): Promise<string | null> {
        let user = cfg.basicUser ?? '';
        let pass = cfg.basicPass ?? '';

        if (cfg.basicSecretCode) {
            const secret = await this.resolveSecret(ctx, cfg.basicSecretCode);
            if (secret && secret.includes(':')) {
                const [u, p] = secret.split(':');
                user = u;
                pass = p;
            }
        }

        if (user && pass) {
            return `${AUTH_SCHEMES.BASIC} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
        }
        return null;
    }

    private async generateHmacSignature(
        ctx: RequestContext,
        cfg: RestExtractConfig,
        method: string,
        url: string,
        body?: unknown,
    ): Promise<string | null> {
        const secret = cfg.hmacSecret ?? await this.resolveSecret(ctx, cfg.hmacSecretCode);
        if (!secret) return null;

        const now = Math.floor(Date.now() / 1000);
        const path = new URL(url, 'http://localhost');
        const template = cfg.hmacPayloadTemplate ?? '${method}:${path}:${timestamp}';
        const payload = template
            .replace('${method}', method)
            .replace('${path}', path.pathname + path.search)
            .replace('${timestamp}', String(now))
            .replace('${body}', body ? JSON.stringify(body) : '');

        return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    }

    private async applyConnectionAuth(
        ctx: RequestContext,
        auth: StoredHttpAuthConfig,
        headers: Record<string, string>,
    ): Promise<void> {
        switch (auth.type) {
            case ConnectionAuthType.BEARER: {
                const token = await this.resolveSecret(ctx, auth.secretCode);
                if (token) headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
                break;
            }
            case ConnectionAuthType.API_KEY: {
                const apiKey = await this.resolveSecret(ctx, auth.secretCode);
                if (apiKey) headers[auth.headerName || HTTP_HEADERS.X_API_KEY] = apiKey;
                break;
            }
            case ConnectionAuthType.BASIC: {
                const username = auth.usernameSecretCode
                    ? await this.resolveSecret(ctx, auth.usernameSecretCode)
                    : auth.username;
                const password = await this.resolveSecret(ctx, auth.secretCode);
                if (username && password) {
                    headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(`${username}:${password}`).toString('base64')}`;
                }
                break;
            }
        }
    }

    private async resolveSecret(ctx: RequestContext, code?: string | null): Promise<string | null> {
        if (!code) return null;
        try {
            return await this.secretService.resolve(ctx, code);
        } catch (err) {
            this.logger.debug('Failed to resolve secret', {
                secretCode: code,
                error: getErrorMessage(err),
            });
            return null;
        }
    }
}
