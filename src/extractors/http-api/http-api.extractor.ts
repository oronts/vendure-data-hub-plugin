import { Injectable } from '@nestjs/common';
import { PaginationType, TIME_UNITS, HTTP } from '../../constants/index';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { executeWithRetry, createRetryConfig, isRetryableError, sleep } from '../../utils/retry.utils';
import {
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
    JsonObject,
} from '../../types/index';
import {
    HttpApiExtractorConfig,
    HttpResponse,
    RETRYABLE_NETWORK_CODES,
    HTTP_DEFAULTS,
} from './types';
import {
    buildUrl,
    buildHeaders,
    buildPaginatedRequest,
    isValidUrl,
    getMethod,
    prepareRequestBody,
} from './request-builder';
import {
    extractRecords,
    buildHttpResponse,
} from './response-parser';
import {
    updatePaginationState,
    initPaginationState,
    getPaginationType,
    hasReachedMaxPages,
} from './pagination';
import { HTTP_API_EXTRACTOR_SCHEMA } from './schema';

@Injectable()
export class HttpApiExtractor implements DataExtractor<HttpApiExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'httpApi';
    readonly name = 'HTTP API Extractor';
    readonly category: ExtractorCategory = 'API';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    readonly schema: StepConfigSchema = HTTP_API_EXTRACTOR_SCHEMA;

    async *extract(
        context: ExtractorContext,
        config: HttpApiExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        const startTime = Date.now();
        let totalFetched = 0;
        let pageCount = 0;
        let requestCount = 0;

        try {
            context.logger.info('Starting HTTP API extraction', {
                url: config.url,
                method: getMethod(config),
            });

            const paginationType = getPaginationType(config);

            if (paginationType === PaginationType.NONE) {
                const response = await this.makeRequest(context, config);
                const records = extractRecords(response.data, config.dataPath);
                requestCount++;

                for (const record of records) {
                    yield {
                        data: record,
                        meta: {
                            sourceId: config.url,
                            sourceTimestamp: new Date().toISOString(),
                        },
                    };
                    totalFetched++;
                }
            } else {
                let state = initPaginationState();
                let hasMore = true;
                const maxPages = config.pagination?.maxPages || HTTP_DEFAULTS.maxPages;

                while (hasMore && !hasReachedMaxPages(pageCount, maxPages)) {
                    if (await context.isCancelled()) {
                        context.logger.warn('Extraction cancelled');
                        break;
                    }

                    if (config.rateLimit?.requestsPerSecond) {
                        await this.rateLimitDelay(config.rateLimit.requestsPerSecond);
                    }

                    const paginatedConfig = buildPaginatedRequest(config, paginationType, state);

                    const response = await this.makeRequest(context, paginatedConfig);
                    const records = extractRecords(response.data, config.dataPath);
                    requestCount++;
                    pageCount++;

                    for (const record of records) {
                        yield {
                            data: record,
                            meta: {
                                sourceId: config.url,
                                sourceTimestamp: new Date().toISOString(),
                                sequence: totalFetched,
                            },
                        };
                        totalFetched++;
                    }

                    const updatedState = updatePaginationState(
                        paginationType,
                        response,
                        config,
                        { ...state, recordCount: records.length },
                    );

                    hasMore = updatedState.hasMore;
                    state = {
                        cursor: updatedState.cursor,
                        offset: updatedState.offset,
                        page: updatedState.page,
                        recordCount: records.length,
                    };

                    context.logger.debug(`Fetched page ${pageCount}`, {
                        records: records.length,
                        totalFetched,
                        hasMore,
                    });
                }
            }

            const durationMs = Date.now() - startTime;
            context.logger.info('HTTP API extraction completed', {
                totalFetched,
                pageCount,
                requestCount,
                durationMs,
            });

            context.setCheckpoint({
                lastExtractedAt: new Date().toISOString(),
                totalFetched,
            });
        } catch (error) {
            context.logger.error('HTTP API extraction failed', toErrorOrUndefined(error), { error: getErrorMessage(error) });
            throw error;
        }
    }

    async validate(
        _context: ExtractorContext,
        config: HttpApiExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string; code?: string }> = [];
        const warnings: Array<{ field?: string; message: string }> = [];

        if (!config.url) {
            errors.push({ field: 'url', message: 'URL is required' });
        } else if (!isValidUrl(config.url, !!config.connectionCode)) {
            errors.push({ field: 'url', message: 'Invalid URL format' });
        }

        if (config.pagination?.type === 'CURSOR' && !config.pagination.cursorPath) {
            warnings.push({
                field: 'pagination.cursorPath',
                message: 'Cursor path not specified for cursor pagination',
            });
        }

        if (config.rateLimit?.requestsPerSecond && config.rateLimit.requestsPerSecond <= 0) {
            errors.push({
                field: 'rateLimit.requestsPerSecond',
                message: 'Rate limit must be positive',
            });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        context: ExtractorContext,
        config: HttpApiExtractorConfig,
    ): Promise<ConnectionTestResult> {
        const startTime = Date.now();

        try {
            const response = await this.makeRequest(context, {
                ...config,
                pagination: { type: 'NONE' as const },
            });

            return {
                success: true,
                details: {
                    statusCode: response.status,
                    statusText: response.statusText,
                },
                latencyMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                error: getErrorMessage(error),
            };
        }
    }

    async preview(
        context: ExtractorContext,
        config: HttpApiExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        const response = await this.makeRequest(context, config);
        const records = extractRecords(response.data, config.dataPath);
        const preview = records.slice(0, limit);

        return {
            records: preview.map((record, index) => ({
                data: record,
                meta: { sourceId: config.url, sequence: index },
            })),
            totalAvailable: records.length,
            metadata: { statusCode: response.status },
        };
    }

    /**
     * Make an HTTP request using the centralised retry utility.
     */
    private async makeRequest(
        context: ExtractorContext,
        config: HttpApiExtractorConfig,
    ): Promise<HttpResponse> {
        const retryConfig = createRetryConfig({
            maxAttempts: config.retry?.maxAttempts || HTTP.MAX_RETRIES,
            initialDelayMs: config.retry?.initialDelayMs,
            maxDelayMs: config.retry?.maxDelayMs,
            backoffMultiplier: config.retry?.backoffMultiplier,
        });

        const retryableStatusCodes = config.retry?.retryableStatusCodes || [...HTTP.RETRYABLE_STATUS_CODES];

        return executeWithRetry(
            async () => {
                const url = await buildUrl(context, config);
                const headers = await buildHeaders(context, config);
                const body = prepareRequestBody(config);

                context.logger.debug(`Making HTTP request`, {
                    method: getMethod(config),
                    url,
                });

                const response = await fetch(url, {
                    method: getMethod(config),
                    headers,
                    body,
                    signal: AbortSignal.timeout(config.timeoutMs || HTTP.TIMEOUT_MS),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await buildHttpResponse(response);
            },
            {
                config: retryConfig,
                isRetryable: (error: unknown) => {
                    // Check status codes from HTTP errors
                    if (error && typeof error === 'object' && 'statusCode' in error) {
                        const statusCode = (error as { statusCode: number }).statusCode;
                        if ((retryableStatusCodes as readonly number[]).includes(statusCode)) {
                            return true;
                        }
                    }
                    // Check network-level error codes
                    if (error && typeof error === 'object' && 'code' in error) {
                        const code = (error as { code: string }).code;
                        if ((RETRYABLE_NETWORK_CODES as readonly string[]).includes(code)) {
                            return true;
                        }
                    }
                    // Fall back to the centralised retryable error detection
                    return isRetryableError(error);
                },
                logger: {
                    warn: (msg: string, meta?: Record<string, unknown>) => context.logger.warn(msg, meta as JsonObject),
                    debug: (msg: string, meta?: Record<string, unknown>) => context.logger.debug(msg, meta as JsonObject),
                },
                context: { url: config.url, method: getMethod(config) },
            },
        );
    }

    private async rateLimitDelay(requestsPerSecond: number): Promise<void> {
        const delayMs = TIME_UNITS.SECOND / requestsPerSecond;
        await sleep(delayMs);
    }
}
