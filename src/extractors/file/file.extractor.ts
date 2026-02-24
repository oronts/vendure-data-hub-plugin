import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import { JsonObject } from '../../types/index';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { PAGINATION } from '../../constants/defaults/ui-defaults';
import { TRANSFORM_LIMITS } from '../../constants/defaults/core-defaults';
import {
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
} from '../../types/index';
import { FileParserService, ParseOptions } from '../../parsers/file-parser.service';
import { FileExtractorConfig, FILE_EXTRACTOR_DEFAULTS } from './types';
import { getFiles, resolvePath } from './helpers';
import { FILE_FORMAT_METADATA } from '../../constants/adapter-schema-options';
import { FILE_EXTRACTOR_SCHEMA } from './schema';

const MAX_SAMPLE_FILES = TRANSFORM_LIMITS.MAX_PREVIEW_FILES;

@Injectable()
export class FileExtractor implements DataExtractor<FileExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'file';
    readonly name = 'File Extractor';
    readonly category: ExtractorCategory = 'FILE_SYSTEM';
    readonly supportsPagination = false;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    constructor(private readonly fileParser: FileParserService) {}

    readonly schema: StepConfigSchema = FILE_EXTRACTOR_SCHEMA;

    async *extract(
        context: ExtractorContext,
        config: FileExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        const startTime = Date.now();
        let totalFetched = 0;
        let filesProcessed = 0;
        let sequence = 0;

        try {
            context.logger.info('Starting file extraction', {
                path: config.path,
                format: config.format || 'auto',
            });

            const files = await getFiles(config);
            context.logger.info(`Found ${files.length} files to process`);

            const modifiedAfter = config.modifiedAfter
                ? new Date(config.modifiedAfter)
                : context.checkpoint.lastExtractedAt
                    ? new Date(context.checkpoint.lastExtractedAt)
                    : undefined;

            let filteredFiles = files;
            if (modifiedAfter) {
                filteredFiles = files.filter(f => f.modifiedAt > modifiedAfter);
                context.logger.info(`Filtered to ${filteredFiles.length} files modified after ${modifiedAfter.toISOString()}`);
            }

            const maxFiles = config.maxFiles || FILE_EXTRACTOR_DEFAULTS.maxFiles;
            if (filteredFiles.length > maxFiles) {
                context.logger.warn(`Limiting to ${maxFiles} files (found ${filteredFiles.length})`);
                filteredFiles = filteredFiles.slice(0, maxFiles);
            }

            for (const file of filteredFiles) {
                if (await context.isCancelled()) {
                    context.logger.warn('Extraction cancelled');
                    break;
                }

                try {
                    context.logger.debug(`Processing file: ${file.path}`);

                    const content = await fs.readFile(file.path);

                    const parseOptions: ParseOptions = {
                        format: config.format,
                        csv: config.csv,
                        json: config.json,
                        xml: config.xml,
                        xlsx: config.xlsx,
                    };

                    const result = await this.fileParser.parse(content, parseOptions);

                    if (!result.success) {
                        const errorMsg = result.errors.map(e => e.message).join('; ');
                        if (config.continueOnError) {
                            context.logger.warn(`Failed to parse ${file.name}: ${errorMsg}`);
                            continue;
                        }
                        throw new Error(`Failed to parse ${file.name}: ${errorMsg}`);
                    }

                    for (const record of result.records) {
                        const data: JsonObject = record as JsonObject;

                        // Add file metadata if requested
                        if (config.includeFileMetadata) {
                            data._file = {
                                path: file.path,
                                name: file.name,
                                size: file.size,
                                modifiedAt: file.modifiedAt.toISOString(),
                            };
                        }

                        yield {
                            data,
                            meta: {
                                sourceId: file.path,
                                sourceTimestamp: file.modifiedAt.toISOString(),
                                sequence: sequence++,
                            },
                        };
                        totalFetched++;
                    }

                    filesProcessed++;
                    context.logger.debug(`Processed ${file.name}`, {
                        records: result.records.length,
                        totalFetched,
                    });
                } catch (error) {
                    if (config.continueOnError) {
                        context.logger.warn(`Error processing ${file.name}`, {
                            error: getErrorMessage(error),
                        });
                    } else {
                        throw error;
                    }
                }
            }

            const durationMs = Date.now() - startTime;
            context.logger.info('File extraction completed', {
                totalFetched,
                filesProcessed,
                durationMs,
            });

            // Save checkpoint with last processed timestamp
            context.setCheckpoint({
                lastExtractedAt: new Date().toISOString(),
                totalFetched,
                filesProcessed,
            });
        } catch (error) {
            context.logger.error('File extraction failed', toErrorOrUndefined(error), { error: getErrorMessage(error) });
            throw error;
        }
    }

    async validate(
        _context: ExtractorContext,
        config: FileExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string; code?: string }> = [];
        const warnings: Array<{ field?: string; message: string }> = [];

        if (!config.path) {
            errors.push({ field: 'path', message: 'File path is required' });
        } else {
            const isGlob = config.path.includes('*') || config.path.includes('?');
            if (!isGlob) {
                try {
                    const fullPath = resolvePath(config.path, config.baseDir);
                    await fs.access(fullPath);
                } catch {
                    // File access check failed - file not found or inaccessible
                    errors.push({ field: 'path', message: `File not found: ${config.path}` });
                }
            }
        }

        const parseableFormats = Object.entries(FILE_FORMAT_METADATA)
            .filter(([, meta]) => meta.parseable)
            .map(([key]) => key);
        if (config.format && !parseableFormats.includes(config.format as string)) {
            errors.push({ field: 'format', message: 'Invalid file format' });
        }

        if (config.modifiedAfter) {
            const date = new Date(config.modifiedAfter);
            if (isNaN(date.getTime())) {
                errors.push({ field: 'modifiedAfter', message: 'Invalid date format' });
            }
        }

        if (config.maxFiles && config.maxFiles <= 0) {
            errors.push({ field: 'maxFiles', message: 'Max files must be positive' });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        _context: ExtractorContext,
        config: FileExtractorConfig,
    ): Promise<ConnectionTestResult> {
        const startTime = Date.now();

        try {
            const files = await getFiles(config);

            return {
                success: true,
                details: {
                    filesFound: files.length,
                    sampleFiles: files.slice(0, MAX_SAMPLE_FILES).map(f => f.name),
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
        _context: ExtractorContext,
        config: FileExtractorConfig,
        limit: number = PAGINATION.FEED_PREVIEW_LIMIT,
    ): Promise<ExtractorPreviewResult> {
        const files = await getFiles(config);

        if (files.length === 0) {
            return {
                records: [],
                totalAvailable: 0,
                metadata: { filesFound: 0 },
            };
        }

        const file = files[0];
        const content = await fs.readFile(file.path);

        const parseOptions: ParseOptions = {
            format: config.format,
            csv: config.csv,
            json: config.json,
            xml: config.xml,
            xlsx: config.xlsx,
        };

        const result = await this.fileParser.parse(content, parseOptions);
        const preview = result.records.slice(0, limit);

        return {
            records: preview.map((record, index) => ({
                data: record as JsonObject,
                meta: {
                    sourceId: file.path,
                    sourceTimestamp: file.modifiedAt.toISOString(),
                    sequence: index,
                },
            })),
            totalAvailable: result.totalRows,
            metadata: {
                format: result.format,
                fields: result.fields,
                filesFound: files.length,
                fileName: file.name,
            },
        };
    }
}
