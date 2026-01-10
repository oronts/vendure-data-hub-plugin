import { Column, Entity } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { LogPersistenceLevel } from '../../constants/enums';

/**
 * AutoMapper configuration for field mapping suggestions.
 */
export interface StoredAutoMapperConfig {
    confidenceThreshold?: number;
    enableFuzzyMatching?: boolean;
    enableTypeInference?: boolean;
    caseSensitive?: boolean;
    customAliases?: Record<string, string[]>;
    excludeFields?: string[];
    weights?: {
        nameSimilarity?: number;
        typeCompatibility?: number;
        descriptionMatch?: number;
    };
}

/**
 * DataHubSettings entity stores global plugin settings.
 * Contains retention policies, logging settings, and AutoMapper configurations.
 */
@Entity('data_hub_settings')
export class DataHubSettings extends VendureEntity {
    constructor(input?: DeepPartial<DataHubSettings>) {
        super(input);
    }

    @Column({ type: 'int', nullable: true })
    retentionDaysRuns: number | null;

    @Column({ type: 'int', nullable: true })
    retentionDaysErrors: number | null;

    /**
     * Log persistence level - controls what gets saved to database for the dashboard.
     * Defaults to PIPELINE (pipeline start/complete/fail + errors).
     */
    @Column({ type: 'varchar', length: 20, default: LogPersistenceLevel.PIPELINE })
    logPersistenceLevel: LogPersistenceLevel;

    /**
     * Retention days for logs in the database.
     * Null means use default (30 days).
     */
    @Column({ type: 'int', nullable: true })
    retentionDaysLogs: number | null;

    /**
     * Global AutoMapper configuration
     */
    @Column({ type: 'simple-json', nullable: true })
    autoMapperConfig: StoredAutoMapperConfig | null;

    /**
     * Per-pipeline AutoMapper configurations
     * Key is the pipeline ID
     */
    @Column({ type: 'simple-json', nullable: true })
    pipelineAutoMapperConfigs: Record<string, StoredAutoMapperConfig> | null;
}
