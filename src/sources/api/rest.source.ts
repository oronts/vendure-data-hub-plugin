/**
 * DataHub Sources - REST API Source
 *
 * Fetches data from REST APIs with pagination support.
 */

import {
    RestApiSourceConfig,
    SourceResult,
    SourceError,
    DataSource,
    PaginationConfig,
} from '../types';
import { DEFAULTS } from '../../constants/index';
import { navigatePath } from '../../parsers/formats/json.parser';
import { buildAuthHeaders } from '../shared';

/**
 * REST API source implementation
 */
export class RestApiSource implements DataSource<RestApiSourceConfig> {
    /**
     * Fetch data from REST API
     */
    async fetch(config: RestApiSourceConfig): Promise<SourceResult> {
        const allRecords: Record<string, unknown>[] = [];
        const errors: SourceError[] = [];
        let hasMore = true;
        let pageCount = 0;
        let cursor: string | undefined;
        let offset = 0;

        const maxPages = config.pagination?.maxPages ?? DEFAULTS.MAX_PAGES;
        const pageSize = config.pagination?.pageSize ?? DEFAULTS.PAGE_SIZE;

        while (hasMore && pageCount < maxPages) {
            try {
                const url = this.buildUrl(config, { cursor, offset, pageSize, pageCount });
                const response = await this.makeRequest(url, config);

                if (!response.ok) {
                    errors.push({
                        code: 'HTTP_ERROR',
                        message: `HTTP ${response.status}: ${response.statusText}`,
                        retryable: this.isRetryableStatus(response.status),
                    });
                    break;
                }

                const data = await response.json();

                // Extract records from response
                const records = this.extractRecords(data, config.dataPath);
                allRecords.push(...records);

                // Check for more pages
                const paginationResult = this.handlePagination(
                    data,
                    response.headers,
                    config.pagination,
                    records.length,
                    pageSize,
                );

                hasMore = paginationResult.hasMore;
                cursor = paginationResult.cursor;
                offset = paginationResult.offset ?? offset + records.length;
                pageCount++;
            } catch (err) {
                errors.push({
                    code: 'FETCH_ERROR',
                    message: err instanceof Error ? err.message : 'API request failed',
                    retryable: true,
                });
                break;
            }
        }

        return {
            success: errors.length === 0,
            records: allRecords,
            total: allRecords.length,
            errors: errors.length > 0 ? errors : undefined,
            metadata: {
                hasMore,
                nextCursor: cursor,
            },
        };
    }

    /**
     * Test API connectivity
     */
    async test(config: RestApiSourceConfig): Promise<{ success: boolean; message?: string }> {
        try {
            const url = this.buildUrl(config, { pageSize: 1, pageCount: 0 });
            const response = await this.makeRequest(url, config);

            if (!response.ok) {
                return {
                    success: false,
                    message: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            return {
                success: true,
                message: 'API is accessible',
            };
        } catch (err) {
            return {
                success: false,
                message: err instanceof Error ? err.message : 'Connection failed',
            };
        }
    }

    /**
     * Build request URL with pagination parameters
     */
    private buildUrl(
        config: RestApiSourceConfig,
        pagination: { cursor?: string; offset?: number; pageSize?: number; pageCount?: number },
    ): string {
        const url = new URL(config.endpoint, config.baseUrl);

        // Add configured query params
        if (config.params) {
            for (const [key, value] of Object.entries(config.params)) {
                url.searchParams.set(key, String(value));
            }
        }

        // Add pagination params
        if (config.pagination) {
            const { strategy } = config.pagination;

            switch (strategy) {
                case 'offset':
                    if (pagination.offset !== undefined) {
                        url.searchParams.set(
                            config.pagination.offset?.offsetParam ?? 'offset',
                            String(pagination.offset),
                        );
                    }
                    if (pagination.pageSize !== undefined) {
                        url.searchParams.set(
                            config.pagination.offset?.limitParam ?? 'limit',
                            String(pagination.pageSize),
                        );
                    }
                    break;

                case 'cursor':
                    if (pagination.cursor) {
                        url.searchParams.set(
                            config.pagination.cursor?.cursorParam ?? 'cursor',
                            pagination.cursor,
                        );
                    }
                    if (pagination.pageSize !== undefined) {
                        url.searchParams.set('limit', String(pagination.pageSize));
                    }
                    break;

                case 'page':
                    if (pagination.pageCount !== undefined) {
                        url.searchParams.set(
                            config.pagination.page?.pageParam ?? 'page',
                            String(pagination.pageCount + 1), // Pages are typically 1-indexed
                        );
                    }
                    if (pagination.pageSize !== undefined) {
                        url.searchParams.set('per_page', String(pagination.pageSize));
                    }
                    break;
            }
        }

        return url.toString();
    }

    /**
     * Make HTTP request
     */
    private async makeRequest(url: string, config: RestApiSourceConfig): Promise<Response> {
        const headers = buildAuthHeaders(config.headers, config.auth);
        const timeout = config.timeout ?? DEFAULTS.HTTP_TIMEOUT_MS;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                method: config.method ?? 'GET',
                headers,
                body: config.body ? JSON.stringify(config.body) : undefined,
                signal: controller.signal,
            });

            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Extract records from response data
     */
    private extractRecords(data: unknown, dataPath?: string): Record<string, unknown>[] {
        let records = dataPath ? navigatePath(data, dataPath) : data;

        if (!Array.isArray(records)) {
            if (typeof records === 'object' && records !== null) {
                records = [records];
            } else {
                return [];
            }
        }

        return records as Record<string, unknown>[];
    }

    /**
     * Handle pagination response
     */
    private handlePagination(
        data: unknown,
        headers: Headers,
        config?: PaginationConfig,
        recordCount?: number,
        pageSize?: number,
    ): { hasMore: boolean; cursor?: string; offset?: number } {
        if (!config) {
            return { hasMore: false };
        }

        switch (config.strategy) {
            case 'offset': {
                const totalPath = config.offset?.totalPath;
                if (totalPath) {
                    const total = navigatePath(data, totalPath) as number;
                    const currentOffset = (recordCount ?? 0);
                    return { hasMore: currentOffset < total };
                }
                // Assume no more if we got fewer records than page size
                return { hasMore: (recordCount ?? 0) >= (pageSize ?? DEFAULTS.PAGE_SIZE) };
            }

            case 'cursor': {
                const cursorPath = config.cursor?.cursorPath;
                const hasNextPath = config.cursor?.hasNextPath;

                const cursor = cursorPath ? (navigatePath(data, cursorPath) as string) : undefined;
                const hasNext = hasNextPath ? (navigatePath(data, hasNextPath) as boolean) : !!cursor;

                return { hasMore: hasNext, cursor };
            }

            case 'page': {
                const totalPagesPath = config.page?.totalPagesPath;
                if (totalPagesPath) {
                    const totalPages = navigatePath(data, totalPagesPath) as number;
                    return { hasMore: false };
                }
                return { hasMore: (recordCount ?? 0) >= (pageSize ?? DEFAULTS.PAGE_SIZE) };
            }

            case 'link': {
                const linkHeader = headers.get('Link');
                if (linkHeader) {
                    const hasNext = linkHeader.includes('rel="next"');
                    return { hasMore: hasNext };
                }
                return { hasMore: false };
            }

            default:
                return { hasMore: false };
        }
    }

    /**
     * Check if HTTP status is retryable
     */
    private isRetryableStatus(status: number): boolean {
        return DEFAULTS.RETRYABLE_STATUS_CODES.includes(status);
    }
}

/**
 * Create a REST API source instance
 */
export function createRestApiSource(): RestApiSource {
    return new RestApiSource();
}
