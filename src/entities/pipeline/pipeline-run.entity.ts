import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Pipeline } from './pipeline.entity';
import { PipelineCheckpoint, PipelineMetrics } from '../../types/index';
import { RunStatus } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.PIPELINE_RUN)
@Index(['pipelineId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['pipelineId', 'status']) // Composite for pipeline-specific status queries
@Index(['startedAt']) // For sorting by execution time
export class PipelineRun extends VendureEntity {
    constructor(input?: DeepPartial<PipelineRun>) {
        super(input);
    }

    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline!: Pipeline;

    @Index()
    @Column({ type: 'int', nullable: true })
    pipelineId!: number | null;

    @Column({ type: 'varchar', length: 20 })
    status!: RunStatus;

    @Column({ type: 'datetime', nullable: true })
    startedAt!: Date | null;

    @Column({ type: 'datetime', nullable: true })
    finishedAt!: Date | null;

    @Column({ type: 'simple-json', nullable: true })
    metrics!: PipelineMetrics | null;

    @Column({ type: 'text', nullable: true })
    error!: string | null;

    @Column({ type: 'simple-json', nullable: true })
    checkpoint!: PipelineCheckpoint | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    startedByUserId!: string | null;

    @Index()
    @Column({ type: 'varchar', length: 255, nullable: true })
    triggeredBy!: string | null;
}
