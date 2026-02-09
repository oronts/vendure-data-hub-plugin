import { Injectable } from '@nestjs/common';
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
import { FileParserService } from '../../parsers/file-parser.service';
import { FileFormat } from '../../constants/enums';
import {
    S3ExtractorConfig,
    S3_DEFAULTS,
} from './types';
import {
    createS3Client,
    buildS3SourceId,
    testS3Connection,
} from './client';
import {
    filterObjects,
    parseS3Content,
    buildObjectMetadata,
    attachMetadataToRecord,
    calculateDestinationKey,
    isValidBucketName,
    isValidPrefix,
    parseModifiedAfterDate,
} from './file-handlers';

@Injectable()
export class S3Extractor implements DataExtractor<S3ExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 's3';
    readonly name = 'S3 Extractor';
    readonly description = 'Extract data from AWS S3 or S3-compatible storage';
    readonly category: ExtractorCategory = 'CLOUD_STORAGE';
    readonly version = '1.0.0';
    readonly icon = 'cloud';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    constructor(private readonly fileParser: FileParserService) {}

    readonly schema: StepConfigSchema = {
        groups: [
            { id: 'connection', label: 'Connection', description: 'S3 connection settings' },
            { id: 'source', label: 'Source', description: 'Bucket and object settings' },
            { id: 'format', label: 'Format', description: 'File format options' },
            { id: 's3select', label: 'S3 Select', description: 'Server-side filtering' },
            { id: 'postProcess', label: 'Post-Processing', description: 'Actions after processing' },
            { id: 'advanced', label: 'Advanced', description: 'Advanced options' },
        ],
        fields: [
            // Connection
            {
                key: 'connectionCode',
                label: 'Connection',
                description: 'Use a saved S3 connection',
                type: 'connection',
                group: 'connection',
            },
            {
                key: 'region',
                label: 'Region',
                description: 'AWS region (e.g., us-east-1)',
                type: 'string',
                placeholder: 'us-east-1',
                group: 'connection',
            },
            {
                key: 'endpoint',
                label: 'Custom Endpoint',
                description: 'Custom S3 endpoint URL (for MinIO, DigitalOcean Spaces, etc.)',
                type: 'string',
                placeholder: 'https://s3.example.com',
                group: 'connection',
            },
            {
                key: 'accessKeyIdSecretCode',
                label: 'Access Key ID',
                description: 'Secret code for AWS Access Key ID',
                type: 'secret',
                group: 'connection',
            },
            {
                key: 'secretAccessKeySecretCode',
                label: 'Secret Access Key',
                description: 'Secret code for AWS Secret Access Key',
                type: 'secret',
                group: 'connection',
            },
            {
                key: 'forcePathStyle',
                label: 'Force Path Style',
                description: 'Use path-style addressing (required for some S3-compatible services)',
                type: 'boolean',
                defaultValue: false,
                group: 'connection',
            },
            // Source
            {
                key: 'bucket',
                label: 'Bucket',
                description: 'S3 bucket name',
                type: 'string',
                required: true,
                placeholder: 'my-data-bucket',
                group: 'source',
            },
            {
                key: 'prefix',
                label: 'Prefix',
                description: 'Object key prefix (folder path)',
                type: 'string',
                placeholder: 'data/imports/',
                group: 'source',
            },
            {
                key: 'suffix',
                label: 'Suffix',
                description: 'Object key suffix (e.g., .csv, .json)',
                type: 'string',
                placeholder: '.csv',
                group: 'source',
            },
            // Format
            {
                key: 'format',
                label: 'File Format',
                type: 'select',
                options: [
                    { value: '', label: 'Auto-detect' },
                    { value: FileFormat.CSV, label: 'CSV' },
                    { value: FileFormat.JSON, label: 'JSON' },
                    { value: FileFormat.XML, label: 'XML' },
                    { value: FileFormat.XLSX, label: 'Excel (XLSX)' },
                ],
                group: 'format',
            },
            {
                key: 'csv.delimiter',
                label: 'CSV Delimiter',
                type: 'select',
                options: [
                    { value: ',', label: 'Comma (,)' },
                    { value: ';', label: 'Semicolon (;)' },
                    { value: '\t', label: 'Tab' },
                    { value: '|', label: 'Pipe (|)' },
                ],
                defaultValue: ',',
                group: 'format',
                dependsOn: { field: 'format', value: FileFormat.CSV },
            },
            {
                key: 'csv.header',
                label: 'Has Header Row',
                type: 'boolean',
                defaultValue: true,
                group: 'format',
                dependsOn: { field: 'format', value: FileFormat.CSV },
            },
            {
                key: 'json.path',
                label: 'JSON Data Path',
                description: 'Path to records array in JSON',
                type: 'string',
                placeholder: 'data.items',
                group: 'format',
                dependsOn: { field: 'format', value: FileFormat.JSON },
            },
            // S3 Select
            {
                key: 's3Select.enabled',
                label: 'Use S3 Select',
                description: 'Use S3 Select for server-side filtering (CSV/JSON only)',
                type: 'boolean',
                defaultValue: false,
                group: 's3select',
            },
            {
                key: 's3Select.expression',
                label: 'SQL Expression',
                description: 'S3 Select SQL expression',
                type: 'string',
                placeholder: "SELECT * FROM s3object WHERE status = 'active'",
                group: 's3select',
                dependsOn: { field: 's3Select.enabled', value: true },
            },
            {
                key: 's3Select.inputSerialization',
                label: 'Input Format',
                type: 'select',
                options: [
                    { value: FileFormat.CSV, label: 'CSV' },
                    { value: FileFormat.JSON, label: 'JSON' },
                ],
                defaultValue: FileFormat.CSV,
                group: 's3select',
                dependsOn: { field: 's3Select.enabled', value: true },
            },
            // Post-Processing
            {
                key: 'deleteAfterProcess',
                label: 'Delete After Processing',
                description: 'Delete objects after successful processing',
                type: 'boolean',
                defaultValue: false,
                group: 'postProcess',
            },
            {
                key: 'moveAfterProcess.enabled',
                label: 'Move After Processing',
                description: 'Move objects to another prefix after processing',
                type: 'boolean',
                defaultValue: false,
                group: 'postProcess',
            },
            {
                key: 'moveAfterProcess.destinationPrefix',
                label: 'Destination Prefix',
                description: 'Prefix to move processed objects to',
                type: 'string',
                placeholder: 'data/processed/',
                group: 'postProcess',
                dependsOn: { field: 'moveAfterProcess.enabled', value: true },
            },
            // Advanced
            {
                key: 'modifiedAfter',
                label: 'Modified After',
                description: 'Only process objects modified after this date',
                type: 'string',
                placeholder: '2024-01-01T00:00:00Z',
                group: 'advanced',
            },
            {
                key: 'maxObjects',
                label: 'Max Objects',
                description: 'Maximum number of objects to process',
                type: 'number',
                defaultValue: S3_DEFAULTS.maxObjects,
                group: 'advanced',
            },
            {
                key: 'includeObjectMetadata',
                label: 'Include Object Metadata',
                description: 'Add S3 metadata (key, size, etag) to records',
                type: 'boolean',
                defaultValue: false,
                group: 'advanced',
            },
            {
                key: 'continueOnError',
                label: 'Continue on Error',
                type: 'boolean',
                defaultValue: true,
                group: 'advanced',
            },
        ],
    };

    async *extract(
        context: ExtractorContext,
        config: S3ExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        context.logger.info('Starting S3 extraction', {
            bucket: config.bucket,
            prefix: config.prefix ?? null,
            region: config.region ?? null,
        });

        const client = await createS3Client(context, config);

        try {
            let continuationToken: string | undefined;
            let objectsProcessed = 0;
            const maxObjects = config.maxObjects || S3_DEFAULTS.maxObjects;

            do {
                if (await context.isCancelled()) break;

                const listResult = await client.listObjects(config.prefix, continuationToken);
                const filteredObjects = filterObjects(listResult.objects, config);

                for (const obj of filteredObjects) {
                    if (await context.isCancelled()) break;
                    if (objectsProcessed >= maxObjects) break;

                    try {
                        const content = await client.getObject(obj.key);
                        const records = await parseS3Content(content, obj.key, config, this.fileParser);
                        const metadata = buildObjectMetadata(config.bucket, obj);

                        for (const record of records) {
                            let data = record;
                            if (config.includeObjectMetadata) {
                                data = attachMetadataToRecord(record, metadata);
                            }

                            yield {
                                data,
                                meta: {
                                    sourceId: buildS3SourceId(config.bucket, obj.key),
                                    sourceTimestamp: obj.lastModified.toISOString(),
                                },
                            };
                        }

                        if (config.deleteAfterProcess) {
                            await client.deleteObject(obj.key);
                            context.logger.debug(`Deleted S3 object: ${obj.key}`);
                        } else if (config.moveAfterProcess?.enabled && config.moveAfterProcess.destinationPrefix) {
                            const destKey = calculateDestinationKey(
                                obj.key,
                                config.prefix,
                                config.moveAfterProcess.destinationPrefix,
                            );
                            await client.copyObject(obj.key, destKey);
                            await client.deleteObject(obj.key);
                            context.logger.debug(`Moved S3 object: ${obj.key} -> ${destKey}`);
                        }

                        objectsProcessed++;
                    } catch (error) {
                        if (!config.continueOnError) throw error;
                        context.logger.warn(`Failed to process S3 object ${obj.key}: ${error}`);
                    }
                }

                continuationToken = listResult.continuationToken;
            } while (continuationToken && objectsProcessed < maxObjects);

            context.logger.info(`S3 extraction completed`, { objectsProcessed });
        } finally {
            await client.close();
        }
    }

    async validate(
        _context: ExtractorContext,
        config: S3ExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string; code?: string }> = [];
        const warnings: Array<{ field?: string; message: string }> = [];

        if (!config.bucket) {
            errors.push({ field: 'bucket', message: 'Bucket name is required' });
        } else if (!isValidBucketName(config.bucket)) {
            errors.push({ field: 'bucket', message: 'Invalid bucket name format' });
        }

        if (!config.connectionCode && !config.region && !config.endpoint) {
            warnings.push({
                message: 'No region or endpoint specified. Will use default region.',
            });
        }

        if (!config.connectionCode) {
            if (config.accessKeyIdSecretCode && !config.secretAccessKeySecretCode) {
                errors.push({
                    field: 'secretAccessKeySecretCode',
                    message: 'Secret Access Key is required when Access Key ID is provided',
                });
            }
            if (!config.accessKeyIdSecretCode && config.secretAccessKeySecretCode) {
                errors.push({
                    field: 'accessKeyIdSecretCode',
                    message: 'Access Key ID is required when Secret Access Key is provided',
                });
            }
        }

        if (config.prefix && !isValidPrefix(config.prefix)) {
            errors.push({ field: 'prefix', message: 'Prefix should not start with /' });
        }

        if (config.modifiedAfter) {
            const date = parseModifiedAfterDate(config.modifiedAfter);
            if (!date) {
                errors.push({ field: 'modifiedAfter', message: 'Invalid date format' });
            }
        }

        if (config.moveAfterProcess?.enabled && !config.moveAfterProcess.destinationPrefix) {
            errors.push({
                field: 'moveAfterProcess.destinationPrefix',
                message: 'Destination prefix is required when move after processing is enabled',
            });
        }

        if (config.s3Select?.enabled) {
            if (!config.s3Select.expression) {
                errors.push({
                    field: 's3Select.expression',
                    message: 'SQL expression is required when S3 Select is enabled',
                });
            }
            if (config.format && ![FileFormat.CSV, FileFormat.JSON].includes(config.format as FileFormat)) {
                errors.push({
                    field: 's3Select.enabled',
                    message: 'S3 Select only supports CSV and JSON formats',
                });
            }
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        context: ExtractorContext,
        config: S3ExtractorConfig,
    ): Promise<ConnectionTestResult> {
        const result = await testS3Connection(context, config);

        if (result.success) {
            return {
                success: true,
                latencyMs: result.latencyMs,
                details: {
                    bucket: config.bucket,
                    prefix: config.prefix ?? null,
                    region: config.region ?? null,
                },
            };
        }

        return {
            success: false,
            error: result.error,
            details: {
                bucket: config.bucket,
                prefix: config.prefix ?? null,
                region: config.region ?? null,
                endpoint: config.endpoint ?? null,
            },
        };
    }

    async preview(
        context: ExtractorContext,
        config: S3ExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        try {
            const client = await createS3Client(context, config);
            const records: RecordEnvelope[] = [];

            try {
                const listResult = await client.listObjects(config.prefix);
                const filteredObjects = filterObjects(listResult.objects, config).slice(0, 5);

                for (const obj of filteredObjects) {
                    if (records.length >= limit) break;

                    try {
                        const content = await client.getObject(obj.key);
                        const parsed = await parseS3Content(content, obj.key, config, this.fileParser);
                        for (const data of parsed.slice(0, limit - records.length)) {
                            records.push({
                                data,
                                meta: {
                                    sourceId: buildS3SourceId(config.bucket, obj.key),
                                    sourceTimestamp: obj.lastModified.toISOString(),
                                },
                            });
                        }
                    } catch {
                        // Skip objects that fail to parse during preview
                    }
                }

                return {
                    records,
                    totalAvailable: listResult.objects.length,
                    metadata: {
                        bucket: config.bucket,
                        prefix: config.prefix ?? null,
                        objectCount: listResult.objects.length,
                    },
                };
            } finally {
                await client.close();
            }
        } catch (error) {
            return {
                records: [],
                totalAvailable: 0,
                metadata: {
                    error: error instanceof Error ? error.message : 'Preview failed',
                    bucket: config.bucket,
                    prefix: config.prefix ?? null,
                },
            };
        }
    }
}
