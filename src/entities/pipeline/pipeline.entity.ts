import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { PipelineDefinition } from '../../types/index';
import { PipelineStatus } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.PIPELINE)
@Index(['code'])
@Index(['status', 'enabled'])
// Note: The reverse order index @Index(['enabled', 'status']) was removed
// as SQLite/sql.js doesn't benefit from it and it caused duplicate index errors during schema sync
export class Pipeline extends VendureEntity {
    constructor(input?: DeepPartial<Pipeline>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255, unique: true })
    code!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;

    @Column({ type: 'int', default: 1 })
    version!: number;

    @Column({ type: 'simple-json' })
    definition!: PipelineDefinition;

    @Column({ type: 'varchar', length: 20, default: PipelineStatus.DRAFT })
    status!: PipelineStatus;

    @Column({ type: 'datetime', nullable: true })
    publishedAt!: Date | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    publishedByUserId!: string | null;

    /**
     * Reference to the currently published revision (no ManyToOne to avoid circular dependency).
     * Indexed for efficient lookups when loading the active revision.
     */
    @Index()
    @Column({ type: 'int', nullable: true })
    currentRevisionId!: number | null;

    /**
     * Reference to the current draft revision (no ManyToOne to avoid circular dependency).
     * Indexed for efficient lookups when loading the draft revision.
     */
    @Index()
    @Column({ type: 'int', nullable: true })
    draftRevisionId!: number | null;

    @Column({ type: 'int', default: 0 })
    publishedVersionCount!: number;
}
