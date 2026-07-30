import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { LogPersistenceLevel } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

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

export type ConsumerControlOverrides = Record<string, boolean>;

@Entity(TABLE_NAMES.SETTINGS)
@Index(['scope'], { unique: true })
export class DataHubSettings extends VendureEntity {
    constructor(input?: DeepPartial<DataHubSettings>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 32, default: 'global' })
    scope!: string;

    @Column({ type: 'int', nullable: true })
    retentionDaysRuns!: number | null;

    @Column({ type: 'int', nullable: true })
    retentionDaysErrors!: number | null;

    @Column({ type: 'varchar', length: 20, default: LogPersistenceLevel.PIPELINE })
    logPersistenceLevel!: LogPersistenceLevel;

    @Column({ type: 'int', nullable: true })
    retentionDaysLogs!: number | null;

    @Column({ type: 'simple-json', nullable: true })
    autoMapperConfig!: StoredAutoMapperConfig | null;

    @Column({ type: 'simple-json', nullable: true })
    pipelineAutoMapperConfigs!: Record<string, StoredAutoMapperConfig> | null;

    @Column({ type: 'simple-json', nullable: true })
    consumerControlOverrides!: ConsumerControlOverrides | null;
}
