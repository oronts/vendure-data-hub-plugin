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
    JsonObject,
} from '../../types/index';
import { FileParserService } from '../../parsers/file-parser.service';
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
import { resolveConnectionBackedConfig } from '../shared/connection-backed-config';
import { readRemoteFileSourceReferences } from '../shared/remote-file-source';
import { assertRemoteFileSize } from '../shared/remote-file-content';
import { resolveBoundedLimit } from '../shared/pagination.utils';
import {
    appendRemoteSourceAcknowledgement,
    createRemoteSourceAcknowledgement,
} from '../shared/remote-source-acknowledgement';

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
        config = await this.resolveConfig(context, config);
        context.logger.info('Starting S3 extraction', {
            bucket: config.bucket,
            prefix: config.prefix ?? null,
            region: config.region ?? null,
        });

        const sourceReferences = readRemoteFileSourceReferences(
            context.sourceRecords,
            config.connectionCode,
        );
        if (sourceReferences !== undefined && sourceReferences.length === 0) {
            throw new Error('No valid remote-file source reference was provided for this S3 extractor');
        }
        const client = await createS3Client(context, config);

        try {
            let continuationToken: string | undefined;
            let objectsProcessed = 0;
            let cancelled = false;
            let checkpointChanged = false;
            let nextCheckpoint = { ...context.checkpoint.data };
            const maxObjects = config.maxObjects || S3_DEFAULTS.maxObjects;
            const processedKeys = new Set<string>(
                (context.checkpoint?.data?.processedS3Keys as string[]) ?? [],
            );

            do {
                if (await context.isCancelled()) {
                    cancelled = true;
                    break;
                }

                const listResult = sourceReferences === undefined
                    ? await client.listObjects(config.prefix, continuationToken)
                    : {
                        objects: sourceReferences.map(reference => ({
                            key: reference.path,
                            size: reference.size,
                            lastModified: new Date(reference.modifiedAt),
                        })),
                        continuationToken: undefined,
                        isTruncated: false,
                    };
                const filteredObjects = filterObjects(listResult.objects, config);

                for (const obj of filteredObjects) {
                    if (await context.isCancelled()) {
                        cancelled = true;
                        break;
                    }
                    if (objectsProcessed >= maxObjects) break;
                    if (sourceReferences === undefined && processedKeys.has(obj.key)) {
                        context.logger.debug(`Skipping already-processed S3 object: ${obj.key}`);
                        objectsProcessed++;
                        continue;
                    }

                    try {
                        assertRemoteFileSize(obj.size, buildS3SourceId(config.bucket, obj.key));
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

                        const action = config.deleteAfterProcess
                            ? { action: 'DELETE' as const }
                            : config.moveAfterProcess?.enabled && config.moveAfterProcess.destinationPrefix
                                ? {
                                    action: 'MOVE' as const,
                                    destinationPath: calculateDestinationKey(
                                        obj.key,
                                        config.prefix,
                                        config.moveAfterProcess.destinationPrefix,
                                    ),
                                }
                                : undefined;
                        if (action) {
                            nextCheckpoint = appendRemoteSourceAcknowledgement(
                                nextCheckpoint,
                                createRemoteSourceAcknowledgement({
                                    runId: context.runId,
                                    stepKey: context.stepKey,
                                    adapterCode: 's3',
                                    sourcePath: obj.key,
                                    config: config as unknown as JsonObject,
                                    ...action,
                                }),
                            );
                            checkpointChanged = true;
                        }

                        processedKeys.add(obj.key);
                        if (sourceReferences === undefined) {
                            checkpointChanged = true;
                        }
                        objectsProcessed++;
                    } catch (error) {
                        if (!config.continueOnError) throw error;
                        context.logger.warn(`Failed to process S3 object ${obj.key}: ${error}`);
                    }
                }

                continuationToken = listResult.continuationToken;
            } while (continuationToken && objectsProcessed < maxObjects);

            if (!cancelled && checkpointChanged) {
                nextCheckpoint.processedS3Keys = [...processedKeys];
                context.setCheckpoint(nextCheckpoint);
            }

            context.logger.info(`S3 extraction completed`, { objectsProcessed });
        } finally {
            await client.close();
        }
    }

    async validate(
        context: ExtractorContext,
        config: S3ExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        config = await this.resolveConfig(context, config);
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

        if (config.s3Select !== undefined) {
            errors.push({
                field: 's3Select',
                message: 'S3 Select is not supported by this extractor',
            });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        context: ExtractorContext,
        config: S3ExtractorConfig,
    ): Promise<ConnectionTestResult> {
        config = await this.resolveConfig(context, config);
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
            config = await this.resolveConfig(context, config);
            const safeLimit = resolveBoundedLimit(
                limit,
                10,
                TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT,
            );
            const client = await createS3Client(context, config);
            const records: RecordEnvelope[] = [];

            try {
                const listResult = await client.listObjects(config.prefix);
                const filteredObjects = filterObjects(listResult.objects, config).slice(0, MAX_PREVIEW_FILES);

                for (const obj of filteredObjects) {
                    if (records.length >= safeLimit) break;

                    try {
                        assertRemoteFileSize(obj.size, buildS3SourceId(config.bucket, obj.key));
                        const content = await client.getObject(obj.key);
                        const parsed = await parseS3Content(content, obj.key, config, this.fileParser);
                        for (const data of parsed.slice(0, safeLimit - records.length)) {
                            records.push({
                                data,
                                meta: {
                                    sourceId: buildS3SourceId(config.bucket, obj.key),
                                    sourceTimestamp: obj.lastModified.toISOString(),
                                },
                            });
                        }
                    } catch (error) {
                        throw new Error(`Unable to preview S3 object ${obj.key}: ${getErrorMessage(error)}`);
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
    private async resolveConfig(
        context: ExtractorContext,
        config: S3ExtractorConfig,
    ): Promise<S3ExtractorConfig> {
        const resolved = await resolveConnectionBackedConfig(
            context,
            config as unknown as JsonObject,
            ['S3'],
        );
        return resolved.config as unknown as S3ExtractorConfig;
    }
}
