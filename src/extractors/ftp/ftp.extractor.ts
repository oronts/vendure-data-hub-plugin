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
import { parseModifiedAfterDate } from '../shared';

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
        context.logger.info('Starting FTP/SFTP extraction', {
            protocol: config.protocol,
            host: config.host,
            remotePath: config.remotePath,
        });

        const client = await createClient(context, config);

        try {
            const allFiles = await client.list(config.remotePath);
            const files = filterFiles(allFiles, config, context.checkpoint.data);
            const maxFiles = config.maxFiles || FTP_DEFAULTS.maxFiles;

            let filesProcessed = 0;
            let lastSuccessfulFile: typeof files[number] | undefined;

            for (const file of files) {
                if (await context.isCancelled()) break;
                if (filesProcessed >= maxFiles) break;

                try {
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

                    // Post-processing
                    if (config.deleteAfterProcess) {
                        await client.delete(file.path);
                        context.logger.debug(`Deleted file: ${file.path}`);
                    } else if (config.moveAfterProcess?.enabled && config.moveAfterProcess.destinationPath) {
                        const destPath = calculateDestinationPath(
                            file.path,
                            config.moveAfterProcess.destinationPath,
                        );
                        await client.rename(file.path, destPath);
                        context.logger.debug(`Moved file: ${file.path} -> ${destPath}`);
                    }

                    filesProcessed++;
                    lastSuccessfulFile = file;
                } catch (error) {
                    if (!config.continueOnError) throw error;
                    context.logger.warn(`Failed to process ${file.path}: ${error}`);
                }
            }

            if (lastSuccessfulFile) {
                context.setCheckpoint({
                    lastProcessedFile: lastSuccessfulFile.path,
                    lastModifiedAt: lastSuccessfulFile.modifiedAt.toISOString(),
                });
            }

            context.logger.info(`FTP/SFTP extraction completed`, { filesProcessed });
        } finally {
            await client.close();
        }
    }

    async validate(
        _context: ExtractorContext,
        config: FtpExtractorConfig,
    ): Promise<ExtractorValidationResult> {
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
            const client = await createClient(context, config);
            const records: RecordEnvelope[] = [];

            try {
                const allFiles = await client.list(config.remotePath);
                const files = filterFiles(allFiles, config).slice(0, MAX_PREVIEW_FILES);

                for (const file of files) {
                    if (records.length >= limit) break;

                    try {
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
                    } catch {
                        // Skip files that fail to parse during preview
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
}
