/**
 * DataHub Sources - Remote File Source
 *
 * Fetches files from remote URLs (HTTP/HTTPS).
 */

import {
    RemoteFileSourceConfig,
    SourceResult,
    SourceError,
    DataSource,
} from '../types';
import { FileParserService } from '../../parsers';
import { DEFAULTS } from '../../constants/index';
import { buildAuthHeaders } from '../shared';

/**
 * Remote file source implementation
 */
export class RemoteFileSource implements DataSource<RemoteFileSourceConfig> {
    constructor(private readonly parser: FileParserService) {}

    /**
     * Fetch file from remote URL
     */
    async fetch(config: RemoteFileSourceConfig): Promise<SourceResult> {
        try {
            const headers = buildAuthHeaders(config.headers, config.auth, {});
            const timeout = config.timeout ?? DEFAULTS.HTTP_TIMEOUT_MS;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await fetch(config.url, {
                    method: config.method ?? 'GET',
                    headers,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    return {
                        success: false,
                        records: [],
                        errors: [
                            {
                                code: 'HTTP_ERROR',
                                message: `HTTP ${response.status}: ${response.statusText}`,
                                retryable: this.isRetryableStatus(response.status),
                            },
                        ],
                    };
                }

                const contentType = response.headers.get('content-type') ?? '';
                const buffer = Buffer.from(await response.arrayBuffer());

                // Parse the content
                const result = await this.parser.parse(buffer, {
                    format: this.detectFormatFromContentType(contentType),
                });

                const errors: SourceError[] = result.errors.map(e => ({
                    code: 'PARSE_ERROR',
                    message: e.message,
                    details: { row: e.row, field: e.field },
                }));

                return {
                    success: result.success,
                    records: result.records,
                    total: result.totalRows,
                    errors: errors.length > 0 ? errors : undefined,
                    metadata: {
                        contentType,
                        size: buffer.length,
                    },
                };
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (err) {
            const isTimeout = err instanceof Error && err.name === 'AbortError';

            return {
                success: false,
                records: [],
                errors: [
                    {
                        code: isTimeout ? 'TIMEOUT' : 'FETCH_ERROR',
                        message: err instanceof Error ? err.message : 'Failed to fetch file',
                        retryable: true,
                    },
                ],
            };
        }
    }

    /**
     * Test remote URL accessibility
     */
    async test(config: RemoteFileSourceConfig): Promise<{ success: boolean; message?: string }> {
        try {
            const headers = buildAuthHeaders(config.headers, config.auth, {});

            const response = await fetch(config.url, {
                method: 'HEAD',
                headers,
            });

            if (!response.ok) {
                return {
                    success: false,
                    message: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            const contentLength = response.headers.get('content-length');
            const contentType = response.headers.get('content-type');

            return {
                success: true,
                message: `Accessible (${contentType}, ${contentLength ? contentLength + ' bytes' : 'size unknown'})`,
            };
        } catch (err) {
            return {
                success: false,
                message: err instanceof Error ? err.message : 'Connection failed',
            };
        }
    }

    /**
     * Detect file format from content-type header
     */
    private detectFormatFromContentType(contentType: string): 'csv' | 'json' | 'xml' | 'xlsx' | undefined {
        const lower = contentType.toLowerCase();

        if (lower.includes('csv') || lower.includes('comma-separated')) {
            return 'csv';
        }
        if (lower.includes('json')) {
            return 'json';
        }
        if (lower.includes('xml')) {
            return 'xml';
        }
        if (lower.includes('spreadsheet') || lower.includes('excel')) {
            return 'xlsx';
        }

        return undefined; // Let parser auto-detect
    }

    /**
     * Check if HTTP status code indicates retryable error
     */
    private isRetryableStatus(status: number): boolean {
        return DEFAULTS.RETRYABLE_STATUS_CODES.includes(status);
    }
}

/**
 * Create a remote file source instance
 */
export function createRemoteFileSource(parser: FileParserService): RemoteFileSource {
    return new RemoteFileSource(parser);
}
