import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Pipeline } from './pipeline.entity';
import { PipelineCheckpoint, PipelineMetrics, RunStatus } from '../../types/index';

/**
 * PipelineRun entity tracks individual executions of a pipeline.
 * Stores execution status, timing, metrics, and any errors encountered.
 */
@Entity('data_hub_pipeline_run')
@Index(['status'])
@Index(['startedAt'])
@Index(['finishedAt'])
export class PipelineRun extends VendureEntity {
    constructor(input?: DeepPartial<PipelineRun>) {
        super(input);
    }

    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline: Pipeline;

    @Index()
    @Column({ nullable: true })
    pipelineId: number;

    @Column({ type: 'varchar' })
    status: RunStatus;

    @Column({ type: 'datetime', nullable: true })
    startedAt: Date | null;

    @Column({ type: 'datetime', nullable: true })
    finishedAt: Date | null;

    @Column('simple-json', { nullable: true })
    metrics: PipelineMetrics | null;

    @Column({ type: 'text', nullable: true })
    error: string | null;

    @Column('simple-json', { nullable: true })
    checkpoint: PipelineCheckpoint | null;

    @Column({ type: 'varchar', nullable: true })
    startedByUserId: string | null;
}
