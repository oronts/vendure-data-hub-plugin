import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import {
    DataExtractor,
    BatchDataExtractor,
    ExtractorCategory,
    isStreamingExtractor,
    isBatchExtractor,
} from '../types/index';
import { getErrorMessage } from '../utils/error.utils';
import { HttpApiExtractor } from './http-api';
import { WebhookExtractor } from './webhook';
import { VendureQueryExtractor } from './vendure-query';
import { FileExtractor } from './file';
import { FtpExtractor } from './ftp';
import { S3Extractor } from './s3';
import { DatabaseExtractor } from './database';
import { GraphQLExtractor } from './graphql';
import { CdcExtractor } from './cdc';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { LOGGER_CONTEXTS } from '../constants/index';

export type ExtractorRegistrationCallback = (registry: ExtractorRegistryService) => void | Promise<void>;

export interface ExtractorMetadata {
    code: string;
    name: string;
    description?: string;
    category: ExtractorCategory;
    version?: string;
    icon?: string;
    supportsPagination?: boolean;
    supportsIncremental?: boolean;
    supportsCancellation?: boolean;
    isStreaming: boolean;
    isBatch: boolean;
}

export interface ExtractorInfo {
    extractor: DataExtractor | BatchDataExtractor;
    metadata: ExtractorMetadata;
    registeredAt: Date;
    registeredBy?: string;
}

@Injectable()
export class ExtractorRegistryService implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private extractors = new Map<string, ExtractorInfo>();
    private customCallbacks: ExtractorRegistrationCallback[] = [];

    constructor(
        loggerFactory: DataHubLoggerFactory,
        @Optional() private readonly httpApiExtractor?: HttpApiExtractor,
        @Optional() private readonly webhookExtractor?: WebhookExtractor,
        @Optional() private readonly vendureQueryExtractor?: VendureQueryExtractor,
        @Optional() private readonly fileExtractor?: FileExtractor,
        @Optional() private readonly ftpExtractor?: FtpExtractor,
        @Optional() private readonly s3Extractor?: S3Extractor,
        @Optional() private readonly databaseExtractor?: DatabaseExtractor,
        @Optional() private readonly graphqlExtractor?: GraphQLExtractor,
        @Optional() private readonly cdcExtractor?: CdcExtractor,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXTRACTOR_REGISTRY);
    }

    async onModuleInit() {
        try {
            this.registerBuiltInExtractors();

            for (const callback of this.customCallbacks) {
                try {
                    await callback(this);
                } catch (error) {
                    this.logger.error(
                        'Extractor registration callback failed',
                        error instanceof Error ? error : undefined,
                    );
                }
            }

            this.logger.info(`Extractor registry initialized`, {
                recordCount: this.extractors.size,
            });

            for (const [code, info] of this.extractors) {
                this.logger.debug(`Registered: ${info.metadata.name} (${code})`, {
                    adapterCode: code,
                    category: info.metadata.category,
                });
            }
        } catch (error) {
            this.logger.error(
                'Failed to initialize extractor registry',
                error instanceof Error ? error : undefined,
            );
        }
    }

    private registerBuiltInExtractors(): void {
        const builtInExtractors: Array<DataExtractor | BatchDataExtractor | undefined> = [
            this.httpApiExtractor,
            this.webhookExtractor,
            this.vendureQueryExtractor,
            this.fileExtractor,
            this.ftpExtractor,
            this.s3Extractor,
            this.databaseExtractor,
            this.graphqlExtractor,
            this.cdcExtractor,
        ];

        for (const extractor of builtInExtractors) {
            if (extractor) {
                try {
                    this.register(extractor, 'built-in');
                } catch (error) {
                    this.logger.warn(`Failed to register built-in extractor`, {
                        error: getErrorMessage(error),
                    });
                }
            }
        }

        this.logger.debug(`Registered built-in extractors`, {
            recordCount: builtInExtractors.filter(Boolean).length,
        });
    }

    addRegistrationCallback(callback: ExtractorRegistrationCallback): void {
        this.customCallbacks.push(callback);
    }

    register(
        extractor: DataExtractor | BatchDataExtractor,
        registeredBy?: string,
    ): void {
        const code = extractor.code;

        if (this.extractors.has(code)) {
            this.logger.warn(`Overwriting existing extractor`, { adapterCode: code });
        }

        const metadata: ExtractorMetadata = {
            code: extractor.code,
            name: extractor.name,
            description: extractor.description,
            category: extractor.category,
            version: extractor.version,
            icon: extractor.icon,
            supportsPagination: extractor.supportsPagination,
            supportsIncremental: extractor.supportsIncremental,
            supportsCancellation: extractor.supportsCancellation,
            isStreaming: isStreamingExtractor(extractor),
            isBatch: isBatchExtractor(extractor),
        };

        const info: ExtractorInfo = {
            extractor,
            metadata,
            registeredAt: new Date(),
            registeredBy,
        };

        this.extractors.set(code, info);
        this.logger.debug(`Registered extractor: ${extractor.name}`, { adapterCode: code });
    }

    registerAll(
        extractors: Array<DataExtractor | BatchDataExtractor>,
        registeredBy?: string,
    ): void {
        for (const extractor of extractors) {
            this.register(extractor, registeredBy);
        }
    }

    getExtractor(code: string): DataExtractor | BatchDataExtractor | undefined {
        return this.extractors.get(code)?.extractor;
    }

    getExtractorInfo(code: string): ExtractorInfo | undefined {
        return this.extractors.get(code);
    }

    getStreamingExtractor(code: string): DataExtractor | undefined {
        const extractor = this.getExtractor(code);
        if (extractor && isStreamingExtractor(extractor)) {
            return extractor;
        }
        return undefined;
    }

    getBatchExtractor(code: string): BatchDataExtractor | undefined {
        const extractor = this.getExtractor(code);
        if (extractor && isBatchExtractor(extractor)) {
            return extractor;
        }
        return undefined;
    }

    listExtractors(): Array<DataExtractor | BatchDataExtractor> {
        return Array.from(this.extractors.values()).map(info => info.extractor);
    }

    hasExtractor(code: string): boolean {
        return this.extractors.has(code);
    }

    getExtractorMetadata(): ExtractorMetadata[] {
        return Array.from(this.extractors.values()).map(info => info.metadata);
    }

    getExtractorsByCategory(): Record<string, ExtractorMetadata[]> {
        const result: Record<string, ExtractorMetadata[]> = {};

        for (const info of this.extractors.values()) {
            const category = info.metadata.category || 'custom';
            if (!result[category]) {
                result[category] = [];
            }
            result[category].push(info.metadata);
        }

        // Sort by name within each category
        for (const category of Object.keys(result)) {
            result[category].sort((a, b) => a.name.localeCompare(b.name));
        }

        return result;
    }

    findExtractors(criteria: {
        category?: ExtractorCategory;
        supportsIncremental?: boolean;
        supportsPagination?: boolean;
    }): ExtractorMetadata[] {
        return this.getExtractorMetadata().filter(meta => {
            if (criteria.category && meta.category !== criteria.category) {
                return false;
            }
            if (criteria.supportsIncremental !== undefined && meta.supportsIncremental !== criteria.supportsIncremental) {
                return false;
            }
            if (criteria.supportsPagination !== undefined && meta.supportsPagination !== criteria.supportsPagination) {
                return false;
            }
            return true;
        });
    }

    unregister(code: string): boolean {
        const existed = this.extractors.delete(code);
        if (existed) {
            this.logger.debug(`Unregistered extractor`, { adapterCode: code });
        }
        return existed;
    }

    clear(): void {
        const count = this.extractors.size;
        this.extractors.clear();
        this.customCallbacks = [];
        this.logger.debug('Cleared all extractors', { recordCount: count });
    }

    get count(): number {
        return this.extractors.size;
    }

    getCategoryLabels(): Record<ExtractorCategory, string> {
        return {
            'DATA_SOURCE': 'Data Sources',
            'FILE_SYSTEM': 'File System',
            'CLOUD_STORAGE': 'Cloud Storage',
            'DATABASE': 'Databases',
            'API': 'APIs',
            'WEBHOOK': 'Webhooks',
            'VENDURE': 'Vendure',
            'CUSTOM': 'Custom',
        };
    }

    validateRequiredExtractors(codes: string[]): { valid: boolean; missing: string[] } {
        const missing = codes.filter(code => !this.hasExtractor(code));
        return {
            valid: missing.length === 0,
            missing,
        };
    }
}
