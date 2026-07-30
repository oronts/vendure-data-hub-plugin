import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { minimatch } from 'minimatch';
import { LOGGER_CONTEXTS } from '../../constants';
import { createFtpClient } from '../../extractors/ftp/connection';
import type { FtpExtractorConfig } from '../../extractors/ftp/types';
import { createS3Client } from '../../extractors/s3/client';
import type { S3ExtractorConfig } from '../../extractors/s3/types';
import {
    createConnectionsAdapter,
    createLoggerAdapter,
    createSecretsAdapter,
} from '../../runtime/executors/context-adapters';
import type { ExtractorContext } from '../../types';
import {
    ConnectionService,
    type RuntimeDataHubConnection,
} from '../config/connection.service';
import { SecretService } from '../config/secret.service';
import {
    DataHubLogger,
    DataHubLoggerFactory,
} from '../logger';
import type { DiscoveredFile } from './file-watch-checkpoint';
import type { FileWatcherConfig } from './file-watch-config';
import {
    discoverFtpFiles,
    discoverS3Objects,
    normalizeS3WatchPrefix,
} from './remote-file-discovery';

type CancellationCheck = () => Promise<boolean>;

@Injectable()
export class FileWatchSourceService {
    private readonly logger: DataHubLogger;

    constructor(
        private connectionService: ConnectionService,
        private secretService: SecretService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(
            LOGGER_CONTEXTS.FILE_WATCH ?? 'DataHub:FileWatch',
        );
    }

    async listFiles(
        ctx: RequestContext,
        config: FileWatcherConfig,
        isCancelled: CancellationCheck,
    ): Promise<DiscoveredFile[]> {
        const connection = await this.connectionService.getRuntimeByCode(
            ctx,
            config.connectionCode,
        );
        if (!connection) {
            throw new Error(`Connection not found: ${config.connectionCode}`);
        }

        const connectionType = connection.type.toUpperCase();
        let files: DiscoveredFile[];
        if (connectionType === 'FTP' || connectionType === 'SFTP') {
            files = await this.listFtpFiles(
                ctx,
                connection,
                config,
                isCancelled,
            );
        } else if (connectionType === 'S3') {
            files = await this.listS3Files(
                ctx,
                connection,
                config,
                isCancelled,
            );
        } else {
            throw new Error(
                `Unsupported connection type for file watch: ${connection.type}`,
            );
        }

        const pattern = config.pattern;
        return pattern
            ? files.filter(file => minimatch(file.name, pattern))
            : files;
    }

    private async listFtpFiles(
        ctx: RequestContext,
        connection: RuntimeDataHubConnection,
        config: FileWatcherConfig,
        isCancelled: CancellationCheck,
    ): Promise<DiscoveredFile[]> {
        const extractorContext = this.createExtractorContext(
            ctx,
            config,
            isCancelled,
        );
        const sourceConfig = {
            ...connection.config,
            connectionCode: connection.code,
            protocol: connection.type === 'SFTP' ? 'sftp' : 'ftp',
            remotePath: config.path,
        } as unknown as FtpExtractorConfig;
        const client = await createFtpClient(extractorContext, sourceConfig);

        try {
            return (await discoverFtpFiles(
                client,
                config.path,
                config.recursive,
            )).map(file => ({
                path: file.path,
                name: file.name,
                modifiedAt: file.modifiedAt,
                size: file.size,
            }));
        } finally {
            await client.close();
        }
    }

    private async listS3Files(
        ctx: RequestContext,
        connection: RuntimeDataHubConnection,
        config: FileWatcherConfig,
        isCancelled: CancellationCheck,
    ): Promise<DiscoveredFile[]> {
        const extractorContext = this.createExtractorContext(
            ctx,
            config,
            isCancelled,
        );
        const sourceConfig = {
            ...connection.config,
            connectionCode: connection.code,
            prefix: config.path,
        } as unknown as S3ExtractorConfig;
        const client = await createS3Client(extractorContext, sourceConfig);
        const prefix = normalizeS3WatchPrefix(config.path);

        try {
            return (await discoverS3Objects(
                client,
                prefix,
                config.recursive,
                extractorContext.isCancelled,
            )).map(object => ({
                path: object.key,
                name: object.key.split('/').pop() ?? object.key,
                modifiedAt: object.lastModified,
                size: object.size,
            }));
        } finally {
            await client.close();
        }
    }

    private createExtractorContext(
        ctx: RequestContext,
        config: FileWatcherConfig,
        isCancelled: CancellationCheck,
    ): ExtractorContext {
        return {
            ctx,
            pipelineId: config.pipelineId,
            runId: 'file-watch-discovery',
            stepKey: config.triggerKey,
            checkpoint: { data: {} },
            secrets: createSecretsAdapter(this.secretService, ctx),
            connections: createConnectionsAdapter(
                this.connectionService,
                ctx,
            ) as ExtractorContext['connections'],
            logger: createLoggerAdapter(this.logger),
            dryRun: false,
            setCheckpoint: () => undefined,
            isCancelled,
        };
    }
}
