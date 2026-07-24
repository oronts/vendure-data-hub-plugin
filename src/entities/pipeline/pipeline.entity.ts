import { Column, Entity, Index, JoinTable, ManyToMany, VersionColumn } from 'typeorm';
import { Channel, ChannelAware, DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { PipelineDefinition } from '../../types/index';
import { ConfigurationSource, PipelineStatus } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.PIPELINE)
@Index(['code'])
@Index(['status', 'enabled'])
export class Pipeline extends VendureEntity implements ChannelAware {
    constructor(input?: DeepPartial<Pipeline>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255, unique: true })
    code!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;

    @Column({
        type: 'varchar',
        length: 20,
        default: ConfigurationSource.DATABASE,
    })
    configurationSource!: ConfigurationSource;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels!: Channel[];

    @Column({ type: 'int', default: 1 })
    version!: number;

    @Column({ type: 'simple-json' })
    definition!: PipelineDefinition;

    @Column({ type: 'varchar', length: 20, default: PipelineStatus.DRAFT })
    status!: PipelineStatus;

    @Column({ type: Date, nullable: true })
    publishedAt!: Date | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    publishedByUserId!: string | null;

    /**
     * Reference to the currently published revision (no ManyToOne to avoid circular dependency).
     * Indexed for efficient lookups when loading the active revision.
     */
    @Index()
    @EntityId({ nullable: true })
    currentRevisionId!: ID | null;

    /**
     * Reference to the current draft revision (no ManyToOne to avoid circular dependency).
     * Indexed for efficient lookups when loading the draft revision.
     */
    @Index()
    @EntityId({ nullable: true })
    draftRevisionId!: ID | null;

    @Column({ type: 'int', default: 0 })
    publishedVersionCount!: number;

    @VersionColumn({ default: 1 })
    rowVersion!: number;
}
