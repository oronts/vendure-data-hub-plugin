/**
 * DataHub Sources - Local File Source
 *
 * Reads files from the local filesystem.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
    LocalFileSourceConfig,
    SourceResult,
    SourceError,
    DataSource,
} from '../types';
import { FileParserService } from '../../parsers';

/**
 * Local file source implementation
 */
export class LocalFileSource implements DataSource<LocalFileSourceConfig> {
    constructor(private readonly parser: FileParserService) {}

    /**
     * Fetch data from local file(s)
     */
    async fetch(config: LocalFileSourceConfig): Promise<SourceResult> {
        const errors: SourceError[] = [];
        const allRecords: Record<string, unknown>[] = [];

        try {
            const stats = await fs.stat(config.path);

            if (stats.isDirectory()) {
                // Read multiple files from directory
                const files = await this.getMatchingFiles(config.path, config.pattern);

                for (const filePath of files) {
                    try {
                        const result = await this.readFile(filePath, config.encoding);
                        allRecords.push(...result.records);
                        if (result.errors) {
                            errors.push(...result.errors);
                        }
                    } catch (err) {
                        errors.push({
                            code: 'FILE_READ_ERROR',
                            message: `Failed to read ${filePath}: ${err instanceof Error ? err.message : 'Unknown error'}`,
                            retryable: false,
                        });
                    }
                }
            } else {
                // Read single file
                const result = await this.readFile(config.path, config.encoding);
                allRecords.push(...result.records);
                if (result.errors) {
                    errors.push(...result.errors);
                }
            }

            return {
                success: errors.length === 0,
                records: allRecords,
                total: allRecords.length,
                errors: errors.length > 0 ? errors : undefined,
                metadata: {
                    filename: path.basename(config.path),
                },
            };
        } catch (err) {
            return {
                success: false,
                records: [],
                errors: [
                    {
                        code: 'FILE_ACCESS_ERROR',
                        message: err instanceof Error ? err.message : 'Failed to access file',
                        retryable: false,
                    },
                ],
            };
        }
    }

    /**
     * Test file accessibility
     */
    async test(config: LocalFileSourceConfig): Promise<{ success: boolean; message?: string }> {
        try {
            await fs.access(config.path, fs.constants.R_OK);
            const stats = await fs.stat(config.path);

            if (stats.isDirectory()) {
                const files = await this.getMatchingFiles(config.path, config.pattern);
                return {
                    success: true,
                    message: `Found ${files.length} matching file(s)`,
                };
            }

            return {
                success: true,
                message: `File accessible (${stats.size} bytes)`,
            };
        } catch (err) {
            return {
                success: false,
                message: err instanceof Error ? err.message : 'File not accessible',
            };
        }
    }

    /**
     * Read and parse a single file
     */
    private async readFile(
        filePath: string,
        encoding?: BufferEncoding,
    ): Promise<{ records: Record<string, unknown>[]; errors?: SourceError[] }> {
        const content = await fs.readFile(filePath);
        const result = await this.parser.parse(content, {
            csv: { encoding: encoding ?? 'utf-8' },
        });

        const errors: SourceError[] = result.errors.map(e => ({
            code: 'PARSE_ERROR',
            message: e.message,
            details: { row: e.row, field: e.field },
        }));

        return {
            records: result.records,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    /**
     * Get files matching pattern in directory
     */
    private async getMatchingFiles(dirPath: string, pattern?: string): Promise<string[]> {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            if (!entry.isFile()) continue;

            const fullPath = path.join(dirPath, entry.name);

            if (pattern) {
                // Simple glob matching (supports * and ?)
                if (this.matchPattern(entry.name, pattern)) {
                    files.push(fullPath);
                }
            } else {
                // Include common data file extensions
                const ext = path.extname(entry.name).toLowerCase();
                if (['.csv', '.json', '.xml', '.xlsx', '.xls', '.tsv'].includes(ext)) {
                    files.push(fullPath);
                }
            }
        }

        return files.sort();
    }

    /**
     * Simple glob pattern matching
     */
    private matchPattern(filename: string, pattern: string): boolean {
        const regex = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');

        return new RegExp(`^${regex}$`, 'i').test(filename);
    }
}

/**
 * Create a local file source instance
 */
export function createLocalFileSource(parser: FileParserService): LocalFileSource {
    return new LocalFileSource(parser);
}
