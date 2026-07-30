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
import { getErrorMessage } from '../../utils/error.utils';
import { TRANSFORM_LIMITS } from '../../constants/defaults/core-defaults';
import { FTP_EXTRACTOR_SCHEMA } from './schema';

import {
    FtpProtocol,
    FTP_PROTOCOLS,
    FtpExtractorConfig,
    FTP_DEFAULTS,
    getDefaultPort,
} from './types';
import {
    createClient,
    buildFtpSourceId,
    testConnection as testFtpConnection,
} from './connection';
import {
    filterFiles,
    parseFtpContent,
    buildFileMetadata,
    attachMetadataToRecord,
    calculateDestinationPath,
    isValidHost,
    isValidPort,
} from './file-operations';
import { isBlockedHostname } from '../../utils/url-security.utils';
import { isProductionEnvironment } from '../../utils/remote-host-security.utils';
import { parseModifiedAfterDate } from '../shared';
import { resolveConnectionBackedConfig } from '../shared/connection-backed-config';
import { readRemoteFileSourceReferences } from '../shared/remote-file-source';
import { assertRemoteFileSize } from '../shared/remote-file-content';
import {
    appendRemoteSourceAcknowledgement,
    createRemoteSourceAcknowledgement,
} from '../shared/remote-source-acknowledgement';

const MAX_PREVIEW_FILES = TRANSFORM_LIMITS.MAX_PREVIEW_FILES;

@Injectable()
export class FtpExtractor implements DataExtractor<FtpExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'ftp';
    readonly name = 'FTP/SFTP Extractor';
    readonly category: ExtractorCategory = 'FILE_SYSTEM';
    readonly supportsPagination = false;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    constructor(private readonly fileParser: FileParserService) {}

    readonly schema: StepConfigSchema = FTP_EXTRACTOR_SCHEMA;

    async *extract(
        context: ExtractorContext,
        config: FtpExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        config = await this.resolveConfig(context, config);
        context.logger.info('Starting FTP/SFTP extraction', {
            protocol: config.protocol,
            host: config.host,
            remotePath: config.remotePath,
        });

        const client = await createClient(context, config);

        try {
            const sourceReferences = readRemoteFileSourceReferences(
                context.sourceRecords,
                config.connectionCode,
            );
            if (sourceReferences !== undefined && sourceReferences.length === 0) {
                throw new Error('No valid remote-file source reference was provided for this FTP/SFTP extractor');
            }
            const files = sourceReferences === undefined
                ? filterFiles(await client.list(config.remotePath), config, context.checkpoint.data)
                : sourceReferences.map(reference => ({
                    path: reference.path,
                    name: reference.name,
                    modifiedAt: new Date(reference.modifiedAt),
                    size: reference.size,
                    isDirectory: false,
                }));
            const maxFiles = config.maxFiles || FTP_DEFAULTS.maxFiles;

            let filesProcessed = 0;
            let contiguousWatermark: typeof files[number] | undefined;
            let canAdvanceWatermark = true;
            let cancelled = false;
            let checkpointChanged = false;
            let nextCheckpoint = { ...context.checkpoint.data };

            for (const file of files) {
                if (await context.isCancelled()) {
                    cancelled = true;
                    break;
                }
                if (filesProcessed >= maxFiles) break;

                try {
                    assertRemoteFileSize(file.size, buildFtpSourceId(config.protocol, config.host, file.path));
                    const content = await client.download(file.path);
                    const records = await parseFtpContent(content, file.name, config, this.fileParser);
                    const metadata = buildFileMetadata(config.protocol, config.host, file);

                    for (const record of records) {
                        let data = record;
                        if (config.includeFileMetadata) {
                            data = attachMetadataToRecord(record, metadata);
                        }

                        yield {
                            data,
                            meta: {
                                sourceId: buildFtpSourceId(config.protocol, config.host, file.path),
                                sourceTimestamp: file.modifiedAt.toISOString(),
                            },
                        };
                    }

                    const action = config.deleteAfterProcess
                        ? { action: 'DELETE' as const }
                        : config.moveAfterProcess?.enabled && config.moveAfterProcess.destinationPath
                            ? {
                                action: 'MOVE' as const,
                                destinationPath: calculateDestinationPath(
                                    file.path,
                                    config.moveAfterProcess.destinationPath,
                                ),
                            }
                            : undefined;
                    if (action) {
                        nextCheckpoint = appendRemoteSourceAcknowledgement(
                            nextCheckpoint,
                            createRemoteSourceAcknowledgement({
                                runId: context.runId,
                                stepKey: context.stepKey,
                                adapterCode: 'ftp',
                                sourcePath: file.path,
                                config: config as unknown as JsonObject,
                                ...action,
                            }),
                        );
                        checkpointChanged = true;
                    }

                    filesProcessed++;
                    if (canAdvanceWatermark && sourceReferences === undefined) {
                        contiguousWatermark = file;
                    }
                } catch (error) {
                    if (!config.continueOnError) throw error;
                    canAdvanceWatermark = false;
                    context.logger.warn(`Failed to process ${file.path}: ${error}`);
                }
            }

            if (!cancelled) {
                if (contiguousWatermark) {
                    nextCheckpoint.lastProcessedFile = contiguousWatermark.path;
                    nextCheckpoint.lastModifiedAt = contiguousWatermark.modifiedAt.toISOString();
                    checkpointChanged = true;
                }
                if (checkpointChanged) {
                    context.setCheckpoint(nextCheckpoint);
                }
            }

            context.logger.info(`FTP/SFTP extraction completed`, { filesProcessed });
        } finally {
            await client.close();
        }
    }

    async validate(
        context: ExtractorContext,
        config: FtpExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        config = await this.resolveConfig(context, config);
        const errors: Array<{ field: string; message: string; code?: string }> = [];
        const warnings: Array<{ field?: string; message: string }> = [];

        const validProtocols = [FTP_PROTOCOLS.FTP, FTP_PROTOCOLS.SFTP];
        if (!config.protocol) {
            errors.push({ field: 'protocol', message: 'Protocol is required' });
        } else if (!validProtocols.includes(config.protocol as FtpProtocol)) {
            errors.push({ field: 'protocol', message: 'Protocol must be "ftp" or "sftp"' });
        }

        if (!config.host) {
            errors.push({ field: 'host', message: 'Host is required' });
        } else if (!isValidHost(config.host)) {
            errors.push({ field: 'host', message: 'Invalid host format' });
        } else if (isBlockedHostname(config.host)) {
            errors.push({ field: 'host', message: 'Host is blocked for security reasons (SSRF protection)' });
        }

        if (!config.remotePath) {
            errors.push({ field: 'remotePath', message: 'Remote path is required' });
        }

        if (config.port !== undefined) {
            if (!isValidPort(config.port)) {
                errors.push({ field: 'port', message: 'Port must be between 1 and 65535' });
            }
        }

        if (!config.connectionCode) {
            if (!config.username) {
                warnings.push({
                    field: 'username',
                    message: 'No username specified - anonymous login will be attempted',
                });
            }

            if (config.protocol === FTP_PROTOCOLS.SFTP && !config.passwordSecretCode && !config.privateKeySecretCode) {
                warnings.push({
                    field: 'auth',
                    message: 'No password or private key specified for SFTP',
                });
            }
        }
        if (
            config.protocol === FTP_PROTOCOLS.SFTP &&
            isProductionEnvironment() &&
            !config.hostKeyFingerprintSecretCode
        ) {
            errors.push({
                field: 'hostKeyFingerprintSecretCode',
                message: 'SFTP host-key fingerprint is required in production',
            });
        }

        if (config.modifiedAfter) {
            const date = parseModifiedAfterDate(config.modifiedAfter);
            if (!date) {
                errors.push({ field: 'modifiedAfter', message: 'Invalid date format' });
            }
        }

        if (config.moveAfterProcess?.enabled && !config.moveAfterProcess.destinationPath) {
            errors.push({
                field: 'moveAfterProcess.destinationPath',
                message: 'Destination path is required when move after processing is enabled',
            });
        }

        if (config.deleteAfterProcess && config.moveAfterProcess?.enabled) {
            warnings.push({
                message: 'Both delete and move after processing are enabled. Delete will take precedence.',
            });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        context: ExtractorContext,
        config: FtpExtractorConfig,
    ): Promise<ConnectionTestResult> {
        config = await this.resolveConfig(context, config);
        const result = await testFtpConnection(context, config);

        if (result.success) {
            return {
                success: true,
                latencyMs: result.latencyMs,
                details: {
                    protocol: config.protocol,
                    host: config.host,
                    port: config.port || getDefaultPort(config.protocol),
                    remotePath: config.remotePath,
                    filesFound: result.filesFound ?? 0,
                },
            };
        }

        return {
            success: false,
            error: result.error,
            details: {
                protocol: config.protocol,
                host: config.host,
                port: config.port || getDefaultPort(config.protocol),
                remotePath: config.remotePath,
            },
        };
    }

    async preview(
        context: ExtractorContext,
        config: FtpExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        try {
            config = await this.resolveConfig(context, config);
            const client = await createClient(context, config);
            const records: RecordEnvelope[] = [];

            try {
                const allFiles = await client.list(config.remotePath);
                const files = filterFiles(allFiles, config).slice(0, MAX_PREVIEW_FILES);

                for (const file of files) {
                    if (records.length >= limit) break;

                    try {
                        assertRemoteFileSize(file.size, buildFtpSourceId(config.protocol, config.host, file.path));
                        const content = await client.download(file.path);
                        const parsed = await parseFtpContent(content, file.name, config, this.fileParser);
                        for (const data of parsed.slice(0, limit - records.length)) {
                            records.push({
                                data,
                                meta: {
                                    sourceId: buildFtpSourceId(config.protocol, config.host, file.path),
                                    sourceTimestamp: file.modifiedAt.toISOString(),
                                },
                            });
                        }
                    } catch (error) {
                        throw new Error(`Unable to preview ${config.protocol.toUpperCase()} file ${file.path}: ${getErrorMessage(error)}`);
                    }
                }

                return {
                    records,
                    totalAvailable: allFiles.length,
                    metadata: {
                        protocol: config.protocol,
                        host: config.host,
                        remotePath: config.remotePath,
                        fileCount: allFiles.length,
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
                    protocol: config.protocol,
                    host: config.host,
                    remotePath: config.remotePath,
                },
            };
        }
    }
    private async resolveConfig(
        context: ExtractorContext,
        config: FtpExtractorConfig,
    ): Promise<FtpExtractorConfig> {
        const resolved = await resolveConnectionBackedConfig(
            context,
            config as unknown as JsonObject,
            ['FTP', 'SFTP'],
        );
        const protocol = resolved.config.protocol ?? (
            resolved.connectionType === 'SFTP'
                ? FTP_PROTOCOLS.SFTP
                : resolved.connectionType === 'FTP'
                    ? FTP_PROTOCOLS.FTP
                    : undefined
        );
        return { ...resolved.config, protocol } as unknown as FtpExtractorConfig;
    }
}
