import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';
import type {
    FeedFieldMapping,
    FeedFilters,
    FeedFormat,
    FeedOptions,
} from '../../feeds/generators/feed-types';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.FEED)
@Index(['channelId', 'code'], { unique: true })
@Index(['scheduleEnabled'])
export class DataHubFeed extends VendureEntity {
    constructor(input?: DeepPartial<DataHubFeed>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255 })
    channelId!: string;

    @Column({ type: 'varchar', length: 255 })
    channelToken!: string;

    @Column({ type: 'varchar', length: 255 })
    code!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'varchar', length: 50 })
    format!: FeedFormat;

    @Column({ type: 'varchar', length: 255, nullable: true })
    customGeneratorCode!: string | null;

    @Column({ type: 'simple-json', nullable: true })
    filters!: FeedFilters | null;

    @Column({ type: 'simple-json', nullable: true })
    fieldMappings!: Record<string, string | FeedFieldMapping> | null;

    @Column({ type: 'simple-json', nullable: true })
    options!: FeedOptions | null;

    @Column({ type: 'boolean', default: false })
    scheduleEnabled!: boolean;

    @Column({ type: 'varchar', length: 255, nullable: true })
    scheduleCron!: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    scheduleTimezone!: string | null;

    @Column({ type: Date, nullable: true })
    lastScheduledAt!: Date | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    artifactFileId!: string | null;

    @Column({ type: Date, nullable: true })
    artifactGeneratedAt!: Date | null;

    @Column({ type: 'int', nullable: true })
    artifactItemCount!: number | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    artifactFilename!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    artifactContentType!: string | null;
}
