import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Pipeline } from './pipeline.entity';
import { PipelineDefinition } from '../../types/index';
import { RevisionType } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

export interface RevisionChangesSummary {
    stepsAdded: string[];
    stepsRemoved: string[];
    stepsModified: string[];
    triggersChanged: boolean;
    hooksChanged: boolean;
    configChanges: number;
    totalChanges: number;
}

@Entity(TABLE_NAMES.PIPELINE_REVISION)
@Index(['pipelineId', 'version'])
@Index(['pipelineId', 'type'])
@Index(['pipelineId', 'createdAt'])
@Index(['type'])
@Index(['definitionHash']) // Index for deduplication checks
export class PipelineRevision extends VendureEntity {
    constructor(input?: DeepPartial<PipelineRevision>) {
        super(input);
    }

    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline!: Pipeline;

    @Index()
    @Column({ type: 'int', nullable: true })
    pipelineId!: number | null;

    @Column({ type: 'int', default: 0 })
    version!: number;

    @Column({ type: 'simple-json' })
    definition!: PipelineDefinition;

    @Column({ type: 'varchar', length: 20, default: RevisionType.DRAFT })
    type!: RevisionType;

    @Column({ type: 'varchar', length: 500, nullable: true })
    commitMessage!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    authorUserId!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    authorName!: string | null;

    @Column({ type: 'simple-json', nullable: true })
    changesSummary!: RevisionChangesSummary | null;

    /**
     * Reference to the previous revision for version history traversal.
     * Indexed for efficient history lookups and diff generation.
     */
    @Index()
    @Column({ type: 'int', nullable: true })
    previousRevisionId!: number | null;

    @Column({ type: 'int', default: 0 })
    definitionSize!: number;

    @Column({ type: 'varchar', length: 64, nullable: true })
    definitionHash!: string | null;
}
