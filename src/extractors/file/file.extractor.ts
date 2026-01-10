import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import { JsonObject } from '../../types/index';
import { PAGINATION, LOGGER_CONTEXTS } from '../../constants/index';
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
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { FileExtractorConfig, FILE_EXTRACTOR_DEFAULTS } from './types';
import { getFiles, resolvePath } from './helpers';

@Injectable()
export class FileExtractor implements DataExtractor<FileExtractorConfig> {
    readonly type = 'extractor' as const;
    readonly code = 'file';
    readonly name = 'File Extractor';
    readonly description = 'Extract data from local files (CSV, JSON, XML, Excel)';
    readonly category: ExtractorCategory = 'file-system';
    readonly version = '1.0.0';
    readonly icon = 'file';
    readonly supportsPagination = false;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    private readonly _logger: DataHubLogger;

    constructor(
        private readonly fileParser: FileParserService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this._logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FILE_EXTRACTOR);
    }

    readonly schema: StepConfigSchema = {
        groups: [
            { id: 'source', label: 'Source', description: 'File source configuration' },
            { id: 'format', label: 'Format', description: 'File format options' },
            { id: 'csv', label: 'CSV Options', description: 'CSV-specific settings' },
            { id: 'json', label: 'JSON Options', description: 'JSON-specific settings' },
            { id: 'xml', label: 'XML Options', description: 'XML-specific settings' },
            { id: 'xlsx', label: 'Excel Options', description: 'Excel-specific settings' },
            { id: 'advanced', label: 'Advanced', description: 'Advanced options' },
        ],
        fields: [
            {
                key: 'path',
                label: 'File Path',
                description: 'File path or glob pattern (e.g., /data/*.csv)',
                type: 'string',
                required: true,
                placeholder: '/data/imports/*.csv',
                group: 'source',
            },
            {
                key: 'baseDir',
                label: 'Base Directory',
                description: 'Base directory for relative paths',
                type: 'string',
                placeholder: '/var/data',
                group: 'source',
            },
            {
                key: 'format',
                label: 'File Format',
                description: 'File format (auto-detected if not specified)',
                type: 'select',
                options: [
                    { value: '', label: 'Auto-detect' },
                    { value: 'csv', label: 'CSV' },
                    { value: 'json', label: 'JSON' },
                    { value: 'xml', label: 'XML' },
                    { value: 'xlsx', label: 'Excel (XLSX)' },
                ],
                group: 'format',
            },
            // CSV Options
            {
                key: 'csv.delimiter',
                label: 'Delimiter',
                type: 'select',
                options: [
                    { value: ',', label: 'Comma (,)' },
                    { value: ';', label: 'Semicolon (;)' },
                    { value: '\t', label: 'Tab' },
                    { value: '|', label: 'Pipe (|)' },
                ],
                defaultValue: ',',
                group: 'csv',
                dependsOn: { field: 'format', value: 'csv' },
            },
            {
                key: 'csv.header',
                label: 'Has Header Row',
                type: 'boolean',
                defaultValue: true,
                group: 'csv',
                dependsOn: { field: 'format', value: 'csv' },
            },
            {
                key: 'csv.skipEmptyLines',
                label: 'Skip Empty Lines',
                type: 'boolean',
                defaultValue: true,
                group: 'csv',
                dependsOn: { field: 'format', value: 'csv' },
            },
            // JSON Options
            {
                key: 'json.path',
                label: 'Data Path',
                description: 'JSON path to records array (e.g., data.items)',
                type: 'string',
                placeholder: 'data.items',
                group: 'json',
                dependsOn: { field: 'format', value: 'json' },
            },
            // XML Options
            {
                key: 'xml.recordPath',
                label: 'Record Path',
                description: 'XPath-like path to record elements',
                type: 'string',
                placeholder: '//products/product',
                group: 'xml',
                dependsOn: { field: 'format', value: 'xml' },
            },
            {
                key: 'xml.attributePrefix',
                label: 'Attribute Prefix',
                description: 'Prefix for XML attributes',
                type: 'string',
                defaultValue: '@',
                group: 'xml',
                dependsOn: { field: 'format', value: 'xml' },
            },
            // Excel Options
            {
                key: 'xlsx.sheet',
                label: 'Sheet Name/Index',
                description: 'Sheet name or zero-based index',
                type: 'string',
                placeholder: 'Sheet1 or 0',
                group: 'xlsx',
                dependsOn: { field: 'format', value: 'xlsx' },
            },
            {
                key: 'xlsx.range',
                label: 'Cell Range',
                description: 'Cell range to read (e.g., A1:Z100)',
                type: 'string',
                placeholder: 'A1:Z100',
                group: 'xlsx',
                dependsOn: { field: 'format', value: 'xlsx' },
            },
            {
                key: 'xlsx.header',
                label: 'Has Header Row',
                type: 'boolean',
                defaultValue: true,
                group: 'xlsx',
                dependsOn: { field: 'format', value: 'xlsx' },
            },
            // Advanced Options
            {
                key: 'modifiedAfter',
                label: 'Modified After',
                description: 'Only process files modified after this date (ISO format)',
                type: 'string',
                placeholder: '2024-01-01T00:00:00Z',
                group: 'advanced',
            },
            {
                key: 'includeFileMetadata',
                label: 'Include File Metadata',
                description: 'Add file path, size, and modified date to records',
                type: 'boolean',
                defaultValue: false,
                group: 'advanced',
            },
            {
                key: 'maxFiles',
                label: 'Max Files',
                description: 'Maximum number of files to process',
                type: 'number',
                defaultValue: FILE_EXTRACTOR_DEFAULTS.maxFiles,
                group: 'advanced',
            },
            {
                key: 'sortBy',
                label: 'Sort Files By',
                type: 'select',
                options: [
                    { value: 'name', label: 'Name' },
                    { value: 'modified', label: 'Modified Date' },
                    { value: 'size', label: 'Size' },
                ],
                defaultValue: 'modified',
                group: 'advanced',
            },
            {
                key: 'sortOrder',
                label: 'Sort Order',
                type: 'select',
                options: [
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                ],
                defaultValue: 'asc',
                group: 'advanced',
            },
            {
                key: 'continueOnError',
                label: 'Continue on Error',
                description: 'Continue processing if a file fails to parse',
                type: 'boolean',
                defaultValue: true,
                group: 'advanced',
            },
        ],
    };

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
                            error: error instanceof Error ? error.message : String(error),
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
            context.logger.error('File extraction failed', error as Error);
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
                    errors.push({ field: 'path', message: `File not found: ${config.path}` });
                }
            }
        }

        if (config.format && !['csv', 'json', 'xml', 'xlsx'].includes(config.format)) {
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
                    sampleFiles: files.slice(0, 5).map(f => f.name),
                },
                latencyMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
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
