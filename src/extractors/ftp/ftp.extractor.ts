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
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { FileFormat } from '../../constants/enums';

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
import { parseModifiedAfterDate } from '../shared';

@Injectable()
export class FtpExtractor implements DataExtractor<FtpExtractorConfig> {
    readonly type = 'extractor' as const;
    readonly code = 'ftp';
    readonly name = 'FTP/SFTP Extractor';
    readonly description = 'Extract data from FTP/SFTP servers';
    readonly category: ExtractorCategory = 'FILE_SYSTEM';
    readonly version = '1.0.0';
    readonly icon = 'server';
    readonly supportsPagination = false;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    private readonly _logger: DataHubLogger;

    constructor(
        private readonly fileParser: FileParserService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this._logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FTP_EXTRACTOR);
    }

    readonly schema: StepConfigSchema = {
        groups: [
            { id: 'connection', label: 'Connection', description: 'FTP/SFTP connection settings' },
            { id: 'auth', label: 'Authentication', description: 'Authentication settings' },
            { id: 'source', label: 'Source', description: 'Remote file settings' },
            { id: 'format', label: 'Format', description: 'File format options' },
            { id: 'postProcess', label: 'Post-Processing', description: 'Actions after processing' },
            { id: 'advanced', label: 'Advanced', description: 'Advanced options' },
        ],
        fields: [
            // Connection
            {
                key: 'connectionCode',
                label: 'Connection',
                description: 'Use a saved FTP/SFTP connection',
                type: 'connection',
                group: 'connection',
            },
            {
                key: 'protocol',
                label: 'Protocol',
                type: 'select',
                required: true,
                options: [
                    { value: FTP_PROTOCOLS.FTP, label: 'FTP' },
                    { value: FTP_PROTOCOLS.SFTP, label: 'SFTP' },
                ],
                defaultValue: FTP_PROTOCOLS.SFTP,
                group: 'connection',
            },
            {
                key: 'host',
                label: 'Host',
                description: 'FTP/SFTP server hostname or IP',
                type: 'string',
                required: true,
                placeholder: 'ftp.example.com',
                group: 'connection',
            },
            {
                key: 'port',
                label: 'Port',
                description: 'Server port (FTP: 21, SFTP: 22)',
                type: 'number',
                group: 'connection',
            },
            {
                key: 'secure',
                label: 'Use FTPS',
                description: 'Enable secure FTP (TLS)',
                type: 'boolean',
                defaultValue: false,
                group: 'connection',
                dependsOn: { field: 'protocol', value: FTP_PROTOCOLS.FTP },
            },
            {
                key: 'passiveMode',
                label: 'Passive Mode',
                description: 'Use passive mode for FTP',
                type: 'boolean',
                defaultValue: true,
                group: 'connection',
                dependsOn: { field: 'protocol', value: FTP_PROTOCOLS.FTP },
            },
            // Authentication
            {
                key: 'username',
                label: 'Username',
                type: 'string',
                placeholder: 'ftpuser',
                group: 'auth',
            },
            {
                key: 'passwordSecretCode',
                label: 'Password',
                description: 'Secret code for password',
                type: 'secret',
                group: 'auth',
            },
            {
                key: 'privateKeySecretCode',
                label: 'Private Key',
                description: 'Secret code for SSH private key (SFTP)',
                type: 'secret',
                group: 'auth',
                dependsOn: { field: 'protocol', value: FTP_PROTOCOLS.SFTP },
            },
            {
                key: 'passphraseSecretCode',
                label: 'Key Passphrase',
                description: 'Secret code for private key passphrase',
                type: 'secret',
                group: 'auth',
                dependsOn: { field: 'protocol', value: FTP_PROTOCOLS.SFTP },
            },
            // Source
            {
                key: 'remotePath',
                label: 'Remote Path',
                description: 'Remote directory path',
                type: 'string',
                required: true,
                placeholder: '/data/exports',
                group: 'source',
            },
            {
                key: 'filePattern',
                label: 'File Pattern',
                description: 'File name pattern (e.g., *.csv, products-*.json)',
                type: 'string',
                placeholder: '*.csv',
                group: 'source',
            },
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
            // Post-Processing
            {
                key: 'deleteAfterProcess',
                label: 'Delete After Processing',
                description: 'Delete files from server after successful processing',
                type: 'boolean',
                defaultValue: false,
                group: 'postProcess',
            },
            {
                key: 'moveAfterProcess.enabled',
                label: 'Move After Processing',
                description: 'Move files to another directory after processing',
                type: 'boolean',
                defaultValue: false,
                group: 'postProcess',
            },
            {
                key: 'moveAfterProcess.destinationPath',
                label: 'Destination Path',
                description: 'Path to move processed files',
                type: 'string',
                placeholder: '/data/processed',
                group: 'postProcess',
                dependsOn: { field: 'moveAfterProcess.enabled', value: true },
            },
            // Advanced
            {
                key: 'modifiedAfter',
                label: 'Modified After',
                description: 'Only process files modified after this date',
                type: 'string',
                placeholder: '2024-01-01T00:00:00Z',
                group: 'advanced',
            },
            {
                key: 'maxFiles',
                label: 'Max Files',
                description: 'Maximum number of files to process',
                type: 'number',
                defaultValue: FTP_DEFAULTS.maxFiles,
                group: 'advanced',
            },
            {
                key: 'includeFileMetadata',
                label: 'Include File Metadata',
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
            {
                key: 'timeoutMs',
                label: 'Timeout (ms)',
                description: 'Connection timeout in milliseconds',
                type: 'number',
                defaultValue: FTP_DEFAULTS.timeoutMs,
                group: 'advanced',
            },
        ],
    };

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
                } catch (error) {
                    if (!config.continueOnError) throw error;
                    context.logger.warn(`Failed to process ${file.path}: ${error}`);
                }
            }

            if (files.length > 0) {
                const lastFile = files[files.length - 1];
                context.setCheckpoint({
                    lastProcessedFile: lastFile.path,
                    lastModifiedAt: lastFile.modifiedAt.toISOString(),
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
                message: 'Both delete and move after processing are enabled. Move will take precedence.',
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
                const files = filterFiles(allFiles, config).slice(0, 5);

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
                    error: error instanceof Error ? error.message : 'Preview failed',
                    protocol: config.protocol,
                    host: config.host,
                    remotePath: config.remotePath,
                },
            };
        }
    }
}
