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
import { TRANSFORM_LIMITS } from '../../constants/defaults/core-defaults';
import { getErrorMessage } from '../../utils/error.utils';
import {
    S3ExtractorConfig,
    S3_DEFAULTS,
} from './types';
import { S3_EXTRACTOR_SCHEMA } from './schema';
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

const MAX_PREVIEW_FILES = TRANSFORM_LIMITS.MAX_PREVIEW_FILES;

@Injectable()
export class S3Extractor implements DataExtractor<S3ExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 's3';
    readonly name = 'S3 Extractor';
    readonly category: ExtractorCategory = 'CLOUD_STORAGE';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    constructor(private readonly fileParser: FileParserService) {}

    readonly schema: StepConfigSchema = S3_EXTRACTOR_SCHEMA;

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
            // Track processed keys via checkpoint for crash-safe resumability
            const processedKeys = new Set<string>(
                (context.checkpoint?.data?.processedS3Keys as string[]) ?? [],
            );

            do {
                if (await context.isCancelled()) break;

                const listResult = await client.listObjects(config.prefix, continuationToken);
                const filteredObjects = filterObjects(listResult.objects, config);

                for (const obj of filteredObjects) {
                    if (await context.isCancelled()) break;
                    if (objectsProcessed >= maxObjects) break;
                    if (processedKeys.has(obj.key)) {
                        context.logger.debug(`Skipping already-processed S3 object: ${obj.key}`);
                        objectsProcessed++;
                        continue;
                    }

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

                        processedKeys.add(obj.key);
                        objectsProcessed++;

                        // Checkpoint after each file so restarts skip completed files
                        if (config.deleteAfterProcess || config.moveAfterProcess?.enabled) {
                            context.setCheckpoint({ processedS3Keys: [...processedKeys] });
                        }
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
                const filteredObjects = filterObjects(listResult.objects, config).slice(0, MAX_PREVIEW_FILES);

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
                    error: getErrorMessage(error),
                    bucket: config.bucket,
                    prefix: config.prefix ?? null,
                },
            };
        }
    }
}
